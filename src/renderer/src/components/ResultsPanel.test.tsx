import { filterResults, aggregateResults, type FilterAppliedQuery } from '../test-fixtures';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsPanel, type ResultViewMode } from './ResultsPanel';
import { useStore } from '../store';
import { Toaster, toast } from 'sonner';
import type { ConnectionState, SaveColumnWidthInput } from '../../../shared/types';

const mockApi = {
  find: vi.fn(),
  aggregate: vi.fn(),
  sampleFields: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  listCollections: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  saveHistory: vi.fn().mockResolvedValue(undefined),
  setWindowTitle: vi.fn(),
  saveColumnWidth: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  onConnectionState: vi.fn<(cb: (state: ConnectionState) => void) => () => void>(),
};

function ResultsHarness() {
  const [viewMode, setViewMode] = useState<ResultViewMode>('table');
  return <ResultsPanel viewMode={viewMode} onViewModeChange={setViewMode} onRowClick={() => {}} />;
}

beforeEach(async () => {
  (window as unknown as Record<string, unknown>).api = mockApi;
  await useStore.getState().disconnect();
  vi.resetAllMocks();
  (window as unknown as Record<string, unknown>).api = mockApi;
  toast.dismiss();
  mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
  mockApi.listCollections.mockResolvedValue({ ok: true, data: [] });
  mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
  mockApi.saveColumnWidth.mockResolvedValue({ ok: true, data: undefined });
  mockApi.onConnectionState.mockImplementation(() => () => {});
  useStore.setState({
    status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'key' },
    selectedDb: 'testdb',
    selectedCollection: 'users',
    collectionColumnWidths: {},
    queryHistory: [],
    historyIndex: null,
    limit: 20,
    projection: null,
    queryMode: 'filter',
    error: null,
    loading: false,
    acceptedResults: filterResults(
      {
        ...useStore.getState().acceptedResults?.appliedQuery,
        db: 'testdb',
        collection: 'users',
        filter: {},
        projection: null,
        sort: null,
        skip: 0,
        limit: 20,
      },
      [],
      0
    ),
  });
});

describe('ResultsPanel', () => {
  it.each(['Table', 'JSON'] as const)(
    'clears old rows and shows the failed new collection error in %s view',
    async (view) => {
      useStore.setState({
        projection: { name: 1 },
        acceptedResults: filterResults(
          { ...useStore.getState().acceptedResults?.appliedQuery, projection: { name: 1 } },
          [{ name: 'USERS_BEFORE' }],
          1
        ),
      });
      render(<ResultsHarness />);
      await userEvent.click(screen.getByRole('button', { name: view }));
      const { promise, resolve: finish } = Promise.withResolvers<unknown>();
      mockApi.find.mockReturnValueOnce(promise);
      let selecting = Promise.resolve();
      act(() => {
        selecting = useStore.getState().selectCollection('testdb', 'orders');
      });

      expect(useStore.getState().selectedCollection).toBe('orders');
      expect(useStore.getState().projection).toBeNull();
      expect(useStore.getState().acceptedResults?.totalCount ?? 0).toBe(0);
      expect(screen.getByRole('region', { name: 'Results' })).not.toHaveTextContent('USERS_BEFORE');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await act(async () => {
        finish({ ok: false, error: 'Orders load rejected' });
        await selecting;
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Orders load rejected');
      expect(screen.getByRole('region', { name: 'Results' })).not.toHaveTextContent('USERS_BEFORE');
      expect(useStore.getState().selectedCollection).toBe('orders');
      expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([]);
      if (view === 'JSON') expect(screen.getByLabelText('JSON results')).toHaveTextContent('[]');

      mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'INVOICES_AFTER' }], totalCount: 1 } });
      await act(async () => {
        await useStore.getState().selectCollection('testdb', 'invoices');
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('INVOICES_AFTER');
    }
  );

  it('switches the loaded page to read-only EJSON without another request and keeps actions above the result', async () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Alice' }];
    useStore.setState({
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 21),
    });
    render(<ResultsHarness />);

    const actions = screen.getByRole('group', { name: 'Result actions' });
    expect(within(actions).getByRole('button', { name: 'Projection options' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Delete results' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Update results' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '_id' })).toBeInTheDocument();
    await userEvent.click(within(actions).getByRole('button', { name: 'JSON' }));

    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(docs, null, 2));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('replaces JSON with the next loaded page and returns to the table without changing the query', async () => {
    const first = [{ _id: 'first' }];
    const second = [{ _id: 'second', when: { $date: '2026-09-27T00:00:00Z' } }];
    useStore.setState({
      limit: 1,
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery, limit: 1 }, first, 2),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: second, totalCount: 2 } });
    render(<ResultsHarness />);

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(second, null, 2));
    expect(screen.getByRole('spinbutton')).toHaveValue(2);
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: 'when' })).toBeInTheDocument();
    expect(screen.queryByLabelText('JSON results')).not.toBeInTheDocument();
  });

  it('shows every loaded aggregate document, including when the filter page limit is smaller', async () => {
    const docs = [{ total: 1 }, { total: 2 }];
    useStore.setState({
      limit: 1,
      queryMode: 'aggregate',
      acceptedResults: aggregateResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs),
    });
    render(<ResultsHarness />);

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByLabelText('JSON results').textContent).toBe(JSON.stringify(docs, null, 2));
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('applies and clears a projection from JSON view while updating the visible documents', async () => {
    useStore.setState({
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery },
        [{ _id: '1', name: 'Alice', secret: true }],
        1
      ),
    });
    mockApi.find
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 } })
      .mockResolvedValueOnce({ ok: false, error: 'Clear rejected' })
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ _id: '1', name: 'Alice', secret: true }], totalCount: 1 } });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Projection JSON5' }), { target: { value: '{ name: 1 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));

    expect(useStore.getState().projection).toEqual({ name: 1 });
    expect(screen.getByLabelText('JSON results')).toHaveTextContent('"name": "Alice"');
    expect(screen.getByLabelText('JSON results')).not.toHaveTextContent('secret');
    expect(screen.getByRole('button', { name: 'Projection options' })).toHaveAttribute('title', 'Projection active');

    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{\n  "name": 1\n}');
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Clear rejected');
    expect(useStore.getState().projection).toEqual({ name: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Clear projection' }));
    expect(useStore.getState().projection).toBeNull();
    expect(screen.getByLabelText('JSON results')).toHaveTextContent('secret');
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{}');
    expect(screen.queryByText('Clear rejected')).not.toBeInTheDocument();
  });

  it('reopens a successful Apply with its projection and without a prior error', async () => {
    mockApi.find
      .mockResolvedValueOnce({ ok: false, error: 'Invalid projection' })
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    const editor = screen.getByRole('textbox', { name: 'Projection JSON5' });
    fireEvent.change(editor, { target: { value: '{ name: 1, secret: 0 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid projection');

    fireEvent.change(editor, { target: { value: '{ name: 1 }' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply projection' }));
    expect(useStore.getState().projection).toEqual({ name: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Projection options' }));
    expect(screen.getByRole('textbox', { name: 'Projection JSON5' })).toHaveValue('{\n  "name": 1\n}');
    expect(screen.queryByText('Invalid projection')).not.toBeInTheDocument();
  });

  it('keeps the paused projection visible in Aggregate mode and prevents applying it', async () => {
    useStore.setState({ projection: { name: 1 }, queryMode: 'aggregate' });
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    const trigger = screen.getByRole('button', { name: 'Projection options' });
    expect(trigger).toHaveAttribute('title', 'Projection paused');
    await userEvent.click(trigger);
    expect(screen.getByText('Projection paused in Aggregate mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply projection' })).toBeDisabled();
  });

  it('retains the actions and pagination during loading, without displaying stale JSON', async () => {
    render(<ResultsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    act(() =>
      useStore.setState({
        loading: true,
        acceptedResults: filterResults(
          { ...useStore.getState().acceptedResults?.appliedQuery },
          [{ name: 'stale' }],
          undefined
        ),
      })
    );
    expect(screen.queryByLabelText('JSON results')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projection options' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('remembers independent completed resizes through sort cycles and loading remounts without freezing untouched columns', async () => {
    const docs = [{ _id: '1', name: 'Alice', email: 'alice@example.test' }];
    useStore.setState({
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 21),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs, totalCount: 21 } });
    render(<ResultsHarness />);
    const resize = (column: string, from: number, to: number) => {
      const header = screen.getByRole('columnheader', { name: column });
      Object.defineProperty(header, 'offsetWidth', { configurable: true, value: from });
      fireEvent.mouseDown(screen.getByRole('separator', { name: `Resize ${column}` }), { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 100 + to - from });
      fireEvent.mouseUp(document);
    };
    resize('name', 150, 220);
    resize('email', 150, 10);
    expect(screen.getByRole('table').querySelector('col:nth-child(4)')).toHaveStyle({ width: '40px' });
    resize('email', 40, 310);
    expect(useStore.getState().collectionColumnWidths).toEqual({ '["testdb","users"]': { name: 220, email: 310 } });

    const { promise, resolve: finish } = Promise.withResolvers<unknown>();
    mockApi.find.mockReturnValueOnce(promise);
    fireEvent.click(screen.getByRole('columnheader', { name: 'name' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await act(async () => finish({ ok: true, data: { docs, totalCount: 21 } }));
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.sort).toEqual({
      name: 1,
    });
    for (const [field, sort] of [
      ['name', { name: -1 }],
      ['name', null],
      ['email', { email: 1 }],
    ] as const) {
      await userEvent.click(screen.getByRole('columnheader', { name: field }));
      expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.sort).toEqual(sort);
      expect(screen.getByRole('table').querySelector('col:nth-child(3)')).toHaveStyle({ width: '220px' });
      expect(screen.getByRole('table').querySelector('col:nth-child(4)')).toHaveStyle({ width: '310px' });
    }
  });

  it('keeps empty results full-width without stretching restored saved columns', async () => {
    const docs = [{ name: 'Alice', email: 'alice@example.test' }];
    useStore.setState({
      collectionColumnWidths: { '["testdb","users"]': { name: 220, email: 310 } },
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 1),
    });
    render(<ResultsHarness />);
    expect(screen.getByRole('table')).toHaveStyle({ width: '578px', minWidth: '578px' });

    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [], totalCount: 0 } });
    await act(async () => {
      await useStore.getState().runQuery('{}');
    });
    expect(screen.getByRole('table')).toHaveStyle({ width: '100%', minWidth: '100%' });

    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs, totalCount: 1 } });
    await act(async () => {
      await useStore.getState().refreshDocs();
    });
    expect(screen.getByRole('table')).toHaveStyle({ width: '578px', minWidth: '578px' });
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '220px' });
    expect(screen.getByRole('table').querySelector('col:nth-child(3)')).toHaveStyle({ width: '310px' });
  });

  it('recovers absent fields and collection-name preferences through navigation, queries, pagination, history and view changes', async () => {
    const docs = [{ name: 'Alice', email: 'a@example.test' }];
    useStore.setState({
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 41),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs, totalCount: 41 } });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: docs });
    render(<ResultsHarness />);
    const header = screen.getByRole('columnheader', { name: 'name' });
    Object.defineProperty(header, 'offsetWidth', { configurable: true, value: 150 });
    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize name' }), { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 200 });
    fireEvent.mouseUp(document);

    await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } });
    await waitFor(() => expect(useStore.getState().loading).toBe(false));
    await act(async () => {
      await useStore.getState().runQuery('{ name: "Alice" }');
    });
    await act(async () => {
      await useStore.getState().refreshDocs();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '250px' });

    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ email: 'only' }], totalCount: 1 } });
    await act(async () => {
      await useStore.getState().applyProjection('{ email: 1, _id: 0 }');
    });
    expect(screen.queryByRole('columnheader', { name: 'name' })).not.toBeInTheDocument();
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [], totalCount: 0 } });
    await act(async () => {
      await useStore.getState().clearProjection();
    });
    expect(screen.getByText('No documents found')).toBeInTheDocument();
    await act(async () => {
      await useStore.getState().refreshDocs();
    });
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '250px' });

    await act(async () => {
      await useStore.getState().selectCollection('testdb', 'renamed');
    });
    expect(useStore.getState().collectionColumnWidths['["testdb","renamed"]']).toBeUndefined();
    await act(async () => {
      await useStore.getState().restoreFromHistory({
        id: 'users',
        db: 'testdb',
        collection: 'users',
        queryMode: 'aggregate',
        query: '[]',
        timestamp: 1,
      });
    });
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '250px' });
    expect(useStore.getState().collectionColumnWidths['["testdb","users"]'].email).toBeUndefined();
    await act(async () => {
      await useStore.getState().selectCollection('otherdb', 'users');
    });
    expect(useStore.getState().collectionColumnWidths['["otherdb","users"]']).toBeUndefined();
    await act(async () => {
      await useStore.getState().selectCollection('testdb', 'users');
    });
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '250px' });
  });

  it('cancels an interrupted drag and restores selection without leaking the preview into another collection', async () => {
    const docs = [{ name: 'Alice', email: 'a@example.test' }];
    useStore.setState({
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 1),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs, totalCount: 1 } });
    render(<ResultsHarness />);
    document.body.style.userSelect = 'text';
    const header = screen.getByRole('columnheader', { name: 'name' });
    Object.defineProperty(header, 'offsetWidth', { configurable: true, value: 150 });
    fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize name' }), { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 300 });
    expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '350px' });
    expect(useStore.getState().collectionColumnWidths).toEqual({});
    await act(async () => {
      await useStore.getState().selectCollection('testdb', 'orders');
    });
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);
    expect(document.body.style.userSelect).toBe('text');
    expect(useStore.getState().collectionColumnWidths).toEqual({});
    document.body.style.userSelect = '';
  });

  it('fits a numeric width once and retains a newer in-memory choice with a visible save failure until reconnect', async () => {
    const docs = [{ name: 'Alice', email: 'a@example.test' }];
    useStore.setState({
      acceptedResults: filterResults({ ...useStore.getState().acceptedResults?.appliedQuery }, docs, 1),
    });
    const context = { font: '', measureText: () => ({ width: 100 }) };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    let storedWidth = 0;
    mockApi.saveColumnWidth.mockImplementation(async (chosen: SaveColumnWidthInput) => {
      if (chosen.width === 300) return { ok: false, error: 'Disk full' };
      storedWidth = chosen.width;
      return { ok: true, data: undefined };
    });
    try {
      render(
        <>
          <ResultsHarness />
          <Toaster />
        </>
      );
      fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize name' }));
      expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '174px' });
      const header = screen.getByRole('columnheader', { name: 'name' });
      Object.defineProperty(header, 'offsetWidth', { configurable: true, value: 174 });
      fireEvent.mouseDown(screen.getByRole('separator', { name: 'Resize name' }), { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 226 });
      fireEvent.mouseUp(document);
      expect(await screen.findByText(/Column width was not saved: Disk full/)).toBeInTheDocument();
      expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '300px' });
      await userEvent.click(screen.getByRole('button', { name: 'JSON' }));
      await userEvent.click(screen.getByRole('button', { name: 'Table' }));
      expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '300px' });
      await act(async () => {
        await useStore.getState().disconnect();
      });
      expect(useStore.getState().collectionColumnWidths).toEqual({});
      mockApi.connect.mockResolvedValue({
        ok: true,
        data: {
          uri: 'mongodb://localhost',
          databases: [],
          queryHistory: [],
          autoSelectedDb: 'testdb',
          collections: [],
          collectionColumnWidths: { '["testdb","users"]': { name: storedWidth } },
        },
      });
      mockApi.find.mockResolvedValue({ ok: true, data: { docs, totalCount: 1 } });
      await act(async () => {
        await useStore.getState().connect('mongodb://localhost');
        await useStore.getState().selectCollection('testdb', 'users');
      });
      expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '174px' });
    } finally {
      getContext.mockRestore();
    }
  });

  it.each(['before', 'after'] as const)(
    'restores saved widths when the connected broadcast arrives %s the connect reply',
    async (connectedOrder) => {
      const uri = 'mongodb://smoke.invalid:27017';
      const connected: ConnectionState = { status: 'connected', uri, connectionKey: 'smoke.invalid:27017' };
      let emit: (state: ConnectionState) => void = () => {};
      mockApi.onConnectionState.mockImplementation((cb) => {
        emit = cb;
        return () => {};
      });
      mockApi.connect.mockImplementation(async () => {
        emit({ status: 'connecting', uri });
        if (connectedOrder === 'before') emit(connected);
        return {
          ok: true,
          data: {
            uri,
            databases: [],
            queryHistory: [],
            autoSelectedDb: 'tracy',
            collections: [],
            collectionColumnWidths: { '["tracy","labels"]': { _id: 600, name: 104 } },
          },
        };
      });
      const docs = [{ _id: '1', name: 'Label' }];
      mockApi.find.mockResolvedValue({ ok: true, data: { docs, totalCount: 1 } });
      useStore.setState({ status: { status: 'disconnected' }, selectedDb: null, selectedCollection: null });
      const unsubscribe = useStore.getState().subscribeToConnectionState();
      try {
        render(<ResultsHarness />);
        await act(async () => {
          await useStore.getState().connect(uri);
          await useStore.getState().selectCollection('tracy', 'labels');
        });
        if (connectedOrder === 'after') act(() => emit(connected));
        expect(screen.getByRole('table').querySelector('col:nth-child(2)')).toHaveStyle({ width: '600px' });
        expect(screen.getByRole('table').querySelector('col:nth-child(3)')).toHaveStyle({ width: '104px' });
        expect(useStore.getState().collectionColumnWidths).toEqual({
          '["tracy","labels"]': { _id: 600, name: 104 },
        });
      } finally {
        unsubscribe();
      }
    }
  );
});
