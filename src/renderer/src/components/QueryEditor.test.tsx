import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { Toaster } from 'sonner';
import { QueryEditor } from './QueryEditor';
import { ResultsPanel } from './ResultsPanel';
import { useStore } from '../store';
import type { Result } from '../../../shared/types';

const alice = { _id: 'accepted', name: 'Alice', status: 'active' };
const mockApi = {
  find: vi.fn(),
  aggregate: vi.fn(),
  explain: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  disconnect: vi.fn(),
  setWindowTitle: vi.fn(),
  saveHistory: vi.fn(),
  sampleFields: vi.fn().mockResolvedValue({ ok: true, data: [] }),
};

function setEditorText(text: string): void {
  const node = screen.getByTestId('query-editor').querySelector<HTMLElement>('.cm-editor')!;
  const view = EditorView.findFromDOM(node)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }));
}

function renderQuery(onRowClick = vi.fn()) {
  return render(
    <>
      <QueryEditor />
      <ResultsPanel viewMode="table" onViewModeChange={() => {}} onRowClick={onRowClick} />
      <Toaster />
    </>
  );
}

beforeEach(async () => {
  vi.resetAllMocks();
  (window as unknown as Record<string, unknown>).api = mockApi;
  await useStore.getState().disconnect();
  useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', limit: 20 });
  mockApi.find.mockResolvedValue({ ok: true, data: { docs: [alice], totalCount: 61 } });
  mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
  await useStore.getState().runQuery('{ status: "active" }');
  mockApi.find.mockClear();
});

describe('rendered query acceptance', () => {
  it.each(['filtered', 'whole collection'] as const)(
    'retains the %s target after rendered Run is rejected, then confirms that exact target',
    async (target) => {
      if (target === 'whole collection') await useStore.getState().runQuery('{}');
      await useStore.getState().fetchPage(20);
      const accepted = useStore.getState().acceptedResults;
      const reply = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      mockApi.find.mockReturnValueOnce(reply.promise);
      renderQuery();
      setEditorText('{ rejected: true }');
      await userEvent.click(screen.getByRole('button', { name: 'Run' }));
      expect(screen.getByRole('button', { name: 'Delete results' })).toBeDisabled();
      expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2);
      await act(async () => {
        reply.resolve({ ok: false, error: 'Candidate rejected by MongoDB' });
        await reply.promise;
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Candidate rejected by MongoDB');
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2);
      expect(useStore.getState().acceptedResults).toBe(accepted);
      await userEvent.click(screen.getByRole('button', { name: 'Delete results' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('61 documents matched');
      expect(dialog).not.toHaveTextContent('rejected');
      if (target === 'whole collection') {
        const confirm = within(dialog).getByRole('button', { name: 'Delete all documents' });
        expect(confirm).toBeDisabled();
        await userEvent.type(within(dialog).getByRole('textbox'), 'users');
        expect(confirm).toBeEnabled();
      } else expect(dialog).toHaveTextContent('"status": "active"');
      mockApi.deleteMany.mockResolvedValue({ ok: true, data: 61 });
      mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [], totalCount: 0 } });
      await userEvent.click(
        within(dialog).getByRole('button', {
          name: target === 'whole collection' ? 'Delete all documents' : 'Delete 61 documents',
        })
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockApi.deleteMany).toHaveBeenCalledWith(
        'testdb',
        'users',
        target === 'whole collection' ? {} : { status: 'active' }
      );
      expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(1);
      expect(screen.getByText('No documents found')).toBeInTheDocument();
    }
  );

  it('pages and updates the accepted filter after a rejected run, despite unsent editor changes', async () => {
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Rejected query' });
    renderQuery();
    setEditorText('{ rejected: true }');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rejected query');
    setEditorText('{ unsent: true }');
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ _id: 'next', name: 'Bob' }], totalCount: 61 } });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2);
    expect(mockApi.find).toHaveBeenLastCalledWith('testdb', 'users', {
      filter: { status: 'active' },
      skip: 20,
      limit: 20,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Update results' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('"status": "active"');
    expect(dialog).not.toHaveTextContent('unsent');
    expect(dialog).not.toHaveTextContent('rejected');
    const editor = EditorView.findFromDOM(
      within(dialog).getByRole('textbox', { name: 'Update document or pipeline' })
    )!;
    act(() =>
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: '{ $set: { archived: true } }' } })
    );
    mockApi.updateMany.mockResolvedValue({ ok: true, data: { matchedCount: 61, modifiedCount: 60 } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Update 61 documents' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockApi.updateMany).toHaveBeenCalledWith(
      'testdb',
      'users',
      { status: 'active' },
      { $set: { archived: true } },
      {}
    );
  });

  it.each(['Next', 'page jump', 'sort', 'page size'] as const)(
    'keeps page labels and accepted sort after a rejected %s change',
    async (action) => {
      await useStore.getState().setSort('name');
      await useStore.getState().fetchPage(20);
      const accepted = useStore.getState().acceptedResults;
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Read rejected' });
      renderQuery();
      if (action === 'Next') await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      if (action === 'page jump') {
        const page = screen.getByRole('spinbutton', { name: 'Page' });
        await userEvent.clear(page);
        await userEvent.type(page, '3');
        await userEvent.tab();
      }
      if (action === 'sort') await userEvent.click(screen.getByRole('columnheader', { name: 'name' }));
      if (action === 'page size')
        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Documents per page' }), '50');
      expect(await screen.findByRole('alert')).toHaveTextContent('Read rejected');
      expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2);
      expect(screen.getByRole('combobox', { name: 'Documents per page' })).toHaveValue('20');
      expect(screen.getByRole('columnheader', { name: 'name' })).toHaveAttribute('aria-sort', 'ascending');
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(useStore.getState().acceptedResults).toBe(accepted);
    }
  );

  it('retains projected columns and edit restrictions when an aggregate run fails and its paused preference is cleared', async () => {
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ data: { id: 42 } }], totalCount: 61 } });
    await useStore.getState().applyProjection("{ 'data.id': 1, _id: 0 }");
    const onRowClick = vi.fn();
    renderQuery(onRowClick);
    await userEvent.click(screen.getByRole('button', { name: 'Aggregate' }));
    setEditorText('[{ $badStage: {} }]');
    mockApi.aggregate.mockResolvedValueOnce({ ok: false, error: 'Pipeline rejected' });
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pipeline rejected');
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(useStore.getState().projection).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'data.id' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('42'));
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Delete results' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('button', { name: 'Delete results' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete results' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('"status": "active"');
  });

  it('shows the complete aggregate array and blocks filter paging and bulk targets after selecting Filter', async () => {
    const docs = Array.from({ length: 25 }, (_, i) => ({ value: i, data: { id: i } }));
    mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: docs });
    renderQuery();
    await userEvent.click(screen.getByRole('button', { name: 'Aggregate' }));
    setEditorText('[]');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(26));
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Documents per page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete results' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
    expect(screen.getAllByRole('row')).toHaveLength(26);
    await userEvent.click(screen.getByRole('columnheader', { name: 'value' }));
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it.each(['delete', 'update'] as const)(
    'invalidates an open %s confirmation when a new accepted snapshot arrives',
    async (action) => {
      renderQuery();
      await userEvent.click(
        screen.getByRole('button', { name: action === 'delete' ? 'Delete results' : 'Update results' })
      );
      const dialog = screen.getByRole('dialog');
      await act(async () => {
        await useStore.getState().runQuery('{}');
      });
      const confirm = within(dialog).getByRole('button', {
        name: action === 'delete' ? 'Delete 61 documents' : 'Update 61 documents',
      });
      expect(confirm).toBeDisabled();
      await userEvent.click(confirm);
      expect(mockApi.deleteMany).not.toHaveBeenCalled();
      expect(mockApi.updateMany).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent('"status": "active"');
    }
  );

  it('provides no bulk target after the first collection load is rejected', async () => {
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'First load rejected' });
    await useStore.getState().selectCollection('testdb', 'orders');
    renderQuery();
    expect(screen.getByRole('alert')).toHaveTextContent('First load rejected');
    expect(screen.getByRole('button', { name: 'Delete results' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Update results' })).toBeDisabled();
    expect(useStore.getState().acceptedResults).toBeNull();
  });

  it('explains the editor query without replacing accepted results', async () => {
    const accepted = useStore.getState().acceptedResults;
    mockApi.explain.mockResolvedValueOnce({ ok: true, data: { queryPlanner: { namespace: 'testdb.users' } } });
    renderQuery();
    setEditorText('{ name: "Bob" }');
    await userEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('testdb.users');
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('renders independent Explain and row loading, accepting rows while diagnostics remain pending', async () => {
    const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
    const rows = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    mockApi.explain.mockReturnValueOnce(explanation.promise);
    mockApi.find.mockReturnValueOnce(rows.promise);
    renderQuery();
    await userEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.getByRole('button', { name: 'Explaining...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    setEditorText('{ name: "Bob" }');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    await act(async () => {
      rows.resolve({ ok: true, data: { docs: [{ _id: 'new', name: 'Bob' }], totalCount: 1 } });
      await rows.promise;
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Explaining...' })).toBeDisabled();
    await act(async () => {
      explanation.resolve({ ok: true, data: { queryPlanner: { namespace: 'testdb.users' } } });
      await explanation.promise;
    });
    expect(await screen.findByRole('dialog')).toHaveTextContent('testdb.users');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('keeps Explain available during a row read and does not release Run when diagnostics finish', async () => {
    const rows = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    mockApi.find.mockReturnValueOnce(rows.promise);
    mockApi.explain.mockResolvedValueOnce({ ok: true, data: { queryPlanner: { namespace: 'testdb.users' } } });
    renderQuery();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('testdb.users');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    await act(async () => {
      rows.resolve({ ok: true, data: { docs: [alice], totalCount: 61 } });
      await rows.promise;
    });
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('closes a delivered diagnostic and suppresses stale error toasts after collection selection', async () => {
    mockApi.explain.mockResolvedValueOnce({ ok: true, data: { queryPlanner: { namespace: 'testdb.users' } } });
    renderQuery();
    await userEvent.click(screen.getByRole('button', { name: 'Explain' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await act(async () => useStore.getState().selectCollection('testdb', 'orders'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
    mockApi.explain.mockReturnValueOnce(explanation.promise);
    await userEvent.click(screen.getByRole('button', { name: 'Explain' }));
    await act(async () => useStore.getState().selectCollection('testdb', 'users'));
    await act(async () => {
      explanation.resolve({ ok: false, error: 'Obsolete diagnostic error' });
      await explanation.promise;
    });
    expect(screen.queryByText('Obsolete diagnostic error')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explain' })).toBeEnabled();
  });

  it('cell filtering ignores unsent editor text and composes from submitted conditions', async () => {
    renderQuery();
    setEditorText('{ unsent: true }');
    const cell = screen.getByText('Alice').closest('td')!;
    await userEvent.click(within(cell).getByRole('button', { name: 'Include this value. Shift+click excludes it.' }));
    await waitFor(() => expect(useStore.getState().loading).toBe(false));
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({
      filter: { status: 'active', name: 'Alice' },
    });
    expect(screen.getByTestId('query-editor')).toHaveTextContent('"name": "Alice"');
    expect(screen.getByTestId('query-editor')).not.toHaveTextContent('unsent');
  });
});
