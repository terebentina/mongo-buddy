import { aggregateResults, filterResults } from '../test-fixtures';
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
  setWindowTitle: vi.fn(),
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

beforeEach(async () => {
  (window as unknown as Record<string, unknown>).api = mockApi;
  mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
  await useStore.getState().disconnect();
  vi.resetAllMocks();
  useStore.setState({
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
    uri: 'mongodb://localhost',
    databases: [],
    collections: [],
    selectedDb: 'testdb',
    selectedCollection: 'users',
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
    acceptedResults: filterResults(),
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('DocumentEditor', () => {
  it('saving a new document closes the dialog and displays the refreshed rows', async () => {
    mockApi.insertOne.mockResolvedValue({ ok: true, data: { _id: '1', name: 'Alice' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 },
    });

    render(<DocumentEditor />);

    await userEvent.click(screen.getByRole('button', { name: /add document/i }));
    setEditorText('{"name":"Alice"}');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useStore.getState().acceptedResults).toEqual(filterResults({}, [{ _id: '1', name: 'Alice' }], 1));
  });

  it('saving an edited document closes the editor and displays the replacement', async () => {
    mockApi.updateOne.mockResolvedValue({ ok: true, data: { _id: { $oid: '123' }, name: 'Bob' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: { $oid: '123' }, name: 'Bob' }], totalCount: 1 },
    });

    const onClose = vi.fn();
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={onClose} />);

    setEditorText('{"name":"Bob"}');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useStore.getState().acceptedResults).toEqual(filterResults({}, [{ _id: { $oid: '123' }, name: 'Bob' }], 1));
  });

  it('deleting a document requires confirmation then closes the editor and removes its result', async () => {
    mockApi.deleteOne.mockResolvedValue({ ok: true, data: undefined });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    const onClose = vi.fn();
    useStore.setState({ acceptedResults: filterResults({}, [{ _id: { $oid: '123' }, name: 'Alice' }], 1) });
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(mockApi.deleteOne).not.toHaveBeenCalled();
    expect(useStore.getState().acceptedResults?.docs).toEqual([{ _id: { $oid: '123' }, name: 'Alice' }]);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useStore.getState().acceptedResults).toEqual(filterResults({}, [], 0));
  });

  it('saving an insert leaves aggregate output unchanged until explicit Run, including output-stage pipelines', async () => {
    const pipeline = [{ $match: { active: true } }, { $out: 'summary' }];
    useStore.getState().setQueryMode('aggregate');
    mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 41 }] });
    await useStore.getState().runQuery(JSON.stringify(pipeline));
    const snapshot = useStore.getState().acceptedResults;
    mockApi.aggregate.mockClear();
    mockApi.insertOne.mockResolvedValueOnce({ ok: true, data: { _id: 'new', name: 'Bob' } });
    render(<DocumentEditor />);
    await userEvent.click(screen.getByRole('button', { name: /add document/i }));
    setEditorText('{ name: "Bob" }');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useStore.getState().acceptedResults).toBe(snapshot);
    expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ total: 41 }]));
    expect(mockApi.aggregate).not.toHaveBeenCalled();
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a saved edit closes successfully when refresh fails and keeps the retained row metadata', async () => {
    const accepted = filterResults(
      { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
      [{ _id: { $oid: '123' }, name: 'Alice' }],
      41
    );
    useStore.setState({ acceptedResults: accepted });
    mockApi.updateOne.mockResolvedValueOnce({ ok: true, data: { _id: { $oid: '123' }, name: 'Bob' } });
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Refresh unavailable' });
    const onClose = vi.fn();
    render(<DocumentEditor editDoc={{ _id: { $oid: '123' }, name: 'Alice' }} onClose={onClose} />);
    setEditorText('{ name: "Bob" }');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(useStore.getState()).toMatchObject({ loading: false, error: 'Refresh unavailable' });
    expect(toast.error).not.toHaveBeenCalled();
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
