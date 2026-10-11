import { filterResults } from '../test-fixtures';
import { useState } from 'react';
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
  aggregate: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  saveHistory: vi.fn(),
};

function getEditorView(): EditorView {
  const el = document.querySelector('.cm-editor');
  const view = el && EditorView.findFromDOM(el as HTMLElement);
  if (!view) throw new Error('CodeMirror EditorView not found');
  return view;
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
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
    uri: 'mongodb://localhost',
    databases: [],
    collections: [],
    selectedDb: 'testdb',
    selectedCollection: 'users',
    limit: 20,
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
    acceptedResults: filterResults(),
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('DocumentEditor', () => {
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

  it('Ctrl+F opens the search panel', async () => {
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={() => {}} />);

    getEditorView().focus();
    await userEvent.keyboard('{Control>}f{/Control}');

    expect(document.querySelector('.cm-search.cm-panel')).toBeTruthy();
  });

  it('Ctrl+H opens the replace panel', async () => {
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={() => {}} />);

    getEditorView().focus();
    await userEvent.keyboard('{Control>}h{/Control}');

    expect(screen.getByRole('textbox', { name: 'Find' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Replace' })).toBeVisible();
  });

  it.each(['search', 'editor', 'dialog button'])(
    'Escape closes search before the edit dialog when focus is on the %s',
    async (focusTarget) => {
      function EditDialog(): React.JSX.Element | null {
        const [editing, setEditing] = useState(true);
        return editing ? (
          <DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={() => setEditing(false)} />
        ) : null;
      }

      render(<EditDialog />);
      const draft = '{"name":"Alice","unsaved":true}';
      setEditorText(draft);
      getEditorView().focus();
      await userEvent.keyboard('{Control>}f{/Control}');
      await userEvent.type(screen.getByRole('textbox', { name: 'Find' }), 'Alice');

      if (focusTarget === 'editor') getEditorView().focus();
      if (focusTarget === 'dialog button') screen.getByRole('button', { name: /^save$/i }).focus();

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('textbox', { name: 'Find' })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(getEditorView().state.doc.toString()).toBe(draft);

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  );
});
