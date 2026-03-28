import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { DocumentEditor } from './DocumentEditor';
import { useStore } from '../store';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  setLastUsed: vi.fn(),
  saveHistory: vi.fn(),
};

function getEditorView(): EditorView {
  const el = document.querySelector('.cm-editor');
  const view = el && EditorView.findFromDOM(el as HTMLElement);
  if (!view) throw new Error('CodeMirror EditorView not found');
  return view;
}

function getEditorText(): string {
  return getEditorView().state.doc.toString();
}

function setEditorText(value: string): void {
  const view = getEditorView();
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    connected: true,
    uri: 'mongodb://localhost',
    databases: [],
    collections: [],
    selectedDb: 'testdb',
    selectedCollection: 'users',
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('DocumentEditor', () => {
  it('Add Document button opens editor dialog with empty template', async () => {
    render(<DocumentEditor />);

    await userEvent.click(screen.getByRole('button', { name: /add document/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getEditorText()).toBe('{\n  \n}');
  });

  it('submit calls insert-one and refreshes table', async () => {
    mockApi.insertOne.mockResolvedValue({ ok: true, data: { _id: '1', name: 'Alice' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 },
    });

    render(<DocumentEditor />);

    await userEvent.click(screen.getByRole('button', { name: /add document/i }));
    setEditorText('{"name":"Alice"}');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockApi.insertOne).toHaveBeenCalledWith('testdb', 'users', { name: 'Alice' });
    });
  });

  it('click row opens editor with doc JSON', () => {
    render(
      <DocumentEditor
        editDoc={{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Alice', age: 30 }}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getEditorText()).toContain('Alice');
  });

  it('save calls update-one and refreshes table', async () => {
    mockApi.updateOne.mockResolvedValue({ ok: true, data: { _id: { $oid: '123' }, name: 'Bob' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: { $oid: '123' }, name: 'Bob' }], totalCount: 1 },
    });

    const onClose = vi.fn();
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={onClose} />);

    setEditorText('{"name":"Bob"}');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockApi.updateOne).toHaveBeenCalledWith('testdb', 'users', { $oid: '123' }, { name: 'Bob' });
    });
  });

  it('delete button shows confirm, calls delete-one, refreshes table', async () => {
    mockApi.deleteOne.mockResolvedValue({ ok: true, data: undefined });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    const onClose = vi.fn();
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(mockApi.deleteOne).toHaveBeenCalledWith('testdb', 'users', { $oid: '123' });
    });
  });

  it('invalid JSON in editor shows error', async () => {
    render(<DocumentEditor />);

    await userEvent.click(screen.getByRole('button', { name: /add document/i }));
    setEditorText('not valid json');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
