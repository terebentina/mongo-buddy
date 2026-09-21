import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { UpdateManyDialog } from './UpdateManyDialog';
import { useStore } from '../store';

const mockApi = {
  updateMany: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    selectedDb: 'testdb',
    selectedCollection: 'users',
    docs: [{ _id: '1' }],
    totalCount: 5,
    filter: { status: 'active' },
    loading: false,
    queryMode: 'filter',
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

function setEditorText(label: string, value: string): void {
  const content = screen.getByRole('textbox', { name: label });
  const editor = content.closest('.cm-editor');
  const view = editor && EditorView.findFromDOM(editor as HTMLElement);
  if (!view) throw new Error(`CodeMirror EditorView not found for "${label}"`);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}

const openDialog = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Update results' }));
};

describe('UpdateManyDialog gating', () => {
  it('does not render the button in aggregate mode', () => {
    useStore.setState({ queryMode: 'aggregate' });
    render(<UpdateManyDialog />);
    expect(screen.queryByRole('button', { name: 'Update results' })).not.toBeInTheDocument();
  });

  it('renders the button in filter mode', () => {
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeInTheDocument();
  });

  it('disables the button while a query is loading', () => {
    useStore.setState({ loading: true });
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
  });

  it('disables the button when the match count is zero', () => {
    useStore.setState({ totalCount: 0 });
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
  });

  it('enables the button when there are matches in filter mode', () => {
    render(<UpdateManyDialog />);
    expect(screen.getByRole('button', { name: 'Update results' })).toBeEnabled();
  });
});

describe('UpdateManyDialog context', () => {
  it('describes both update forms and shows an update pipeline example', async () => {
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/update document or an update pipeline/i);
    expect(dialog.textContent).toContain('data.name');
    expect(dialog.textContent).toContain('$title');
  });

  it('renders update and options editors side by side', async () => {
    render(<UpdateManyDialog />);
    await openDialog();

    const updateEditor = screen.getByRole('textbox', { name: 'Update document or pipeline' });
    const optionsEditor = screen.getByRole('textbox', { name: 'Update options' });
    expect(updateEditor.closest('.grid')).toBe(optionsEditor.closest('.grid'));
  });

  it('sends options from the second editor with the update', async () => {
    mockApi.updateMany.mockResolvedValue({ ok: true, data: { matchedCount: 5, modifiedCount: 5 } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
    render(<UpdateManyDialog />);
    await openDialog();
    setEditorText('Update options', '{ upsert: true, hint: { status: 1 }, writeConcern: { w: "majority" } }');

    await userEvent.click(screen.getByRole('button', { name: 'Update 5 documents' }));

    await waitFor(() => {
      expect(mockApi.updateMany).toHaveBeenCalledWith(
        'testdb',
        'users',
        { status: 'active' },
        { $set: {} },
        { upsert: true, hint: { status: 1 }, writeConcern: { w: 'majority' } }
      );
    });
  });

  it('shows the applied filter JSON and the match count', async () => {
    useStore.setState({ filter: { status: 'active' }, totalCount: 42 });
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('"status"');
    expect(dialog.textContent).toContain('"active"');
    expect(dialog.textContent).toContain('42');
    expect(dialog.textContent).toMatch(/matching the currently applied filter/i);
  });

  it('labels the confirm button with the match count', async () => {
    useStore.setState({ totalCount: 42 });
    render(<UpdateManyDialog />);
    await openDialog();

    expect(screen.getByRole('button', { name: 'Update 42 documents' })).toBeInTheDocument();
  });

  it('shows a stronger whole-collection warning when the filter is empty', async () => {
    useStore.setState({ filter: {}, totalCount: 100 });
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/ALL documents in the collection/i);
  });

  it('does not show the whole-collection warning when the filter is non-empty', async () => {
    useStore.setState({ filter: { status: 'active' }, totalCount: 5 });
    render(<UpdateManyDialog />);
    await openDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toMatch(/ALL documents in the collection/i);
  });
});
