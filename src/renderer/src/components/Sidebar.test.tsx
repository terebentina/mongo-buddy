import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from './Sidebar';
import { useStore } from '../store';
import { aggregateResults, filterResults } from '../test-fixtures';
import type { Result } from '../../../shared/types';

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  aggregate: vi.fn(),
  emptyCollection: vi.fn(),
  sampleFields: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  saveHistory: vi.fn(),
  saveCollectionSort: vi.fn(),
  pickImportFile: vi.fn().mockResolvedValue({ ok: true, data: null }),
  operationStart: vi.fn().mockResolvedValue({ ok: true, data: 'op-1' }),
  operationCancel: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  onOperationUpdate: vi.fn().mockReturnValue(() => {}),
  createCollection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  dropCollection: vi.fn().mockResolvedValue({ ok: true }),
  renameCollection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  setWindowTitle: vi.fn(),
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  (window as unknown as Record<string, unknown>).api = mockApi;
  mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
  await useStore.getState().disconnect();
  vi.resetAllMocks();
  mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
  mockApi.saveCollectionSort.mockResolvedValue({ ok: true, data: undefined });
  mockApi.pickImportFile.mockResolvedValue({ ok: true, data: null });
  mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-1' });
  mockApi.operationCancel.mockResolvedValue({ ok: true, data: undefined });
  mockApi.onOperationUpdate.mockReturnValue(() => {});
  mockApi.createCollection.mockResolvedValue({ ok: true, data: undefined });
  mockApi.dropCollection.mockResolvedValue({ ok: true, data: undefined });
  mockApi.renameCollection.mockResolvedValue({ ok: true, data: undefined });
  useStore.setState({
    status: { status: 'disconnected' },
    uri: '',
    databases: [],
    ghostDatabases: [],
    collections: [],
    expandedDb: null,
    selectedDb: null,
    selectedCollection: null,
    collectionSorts: {},
    error: null,
    loading: false,
    acceptedResults: null,
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('Sidebar', () => {
  it('click DB expands to show collections', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [
        { name: 'users', type: 'collection' },
        { name: 'posts', type: 'collection' },
      ],
    });

    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    await userEvent.click(screen.getByText('testdb'));

    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb');

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('posts')).toBeInTheDocument();
    });
  });

  it('click expanded DB collapses its collections and another click expands them', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }],
    });

    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    await userEvent.click(screen.getByText('testdb'));
    expect(await screen.findByText('users')).toBeInTheDocument();

    await userEvent.click(screen.getByText('testdb'));
    expect(screen.queryByText('users')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('testdb'));
    expect(await screen.findByText('users')).toBeInTheDocument();
    expect(mockApi.listCollections).toHaveBeenCalledTimes(2);
  });

  it('hides the previous collections while the next database loads', async () => {
    let resolveNextCollections!: (value: { ok: true; data: { name: string; type: string }[] }) => void;
    const nextCollections = new Promise<{
      ok: true;
      data: { name: string; type: string }[];
    }>((resolve) => {
      resolveNextCollections = resolve;
    });

    mockApi.listCollections
      .mockResolvedValueOnce({
        ok: true,
        data: [{ name: 'users', type: 'collection' }],
      })
      .mockReturnValueOnce(nextCollections);

    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [
        { name: 'first-db', sizeOnDisk: 1024, empty: false },
        { name: 'second-db', sizeOnDisk: 1024, empty: false },
      ],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    await userEvent.click(screen.getByText('first-db'));
    await screen.findByText('users');
    await userEvent.click(screen.getByText('second-db'));

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();

    resolveNextCollections({
      ok: true,
      data: [{ name: 'orders', type: 'collection' }],
    });
    expect(await screen.findByText('orders')).toBeInTheDocument();
  });

  it('click collection calls store.selectCollection', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }],
    });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    // Click to expand db (triggers selectDb which loads collections)
    await userEvent.click(screen.getByText('testdb'));

    // Wait for collections to appear
    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
    });

    // Click collection
    await userEvent.click(screen.getByText('users'));

    await waitFor(() => {
      expect(mockApi.find).toHaveBeenCalled();
    });
  });

  it('creates and selects a collection from a database menu', async () => {
    mockApi.listCollections
      .mockResolvedValueOnce({ ok: true, data: [{ name: 'orders', type: 'collection' }] })
      .mockResolvedValueOnce({
        ok: true,
        data: [
          { name: 'orders', type: 'collection' },
          { name: 'users', type: 'collection' },
        ],
      });
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    const databaseRow = screen.getByText('testdb').closest('button')!;
    await userEvent.click(databaseRow.querySelector('[aria-haspopup="menu"]')!);
    await userEvent.click(await screen.findByText('Create collection…'));
    await userEvent.type(screen.getByPlaceholderText('Collection name'), 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockApi.createCollection).toHaveBeenCalledWith('testdb', 'users'));
    await waitFor(() => expect(useStore.getState().selectedCollection).toBe('users'));
    expect(mockApi.listCollections).toHaveBeenNthCalledWith(1, 'testdb');
    expect(mockApi.listCollections).toHaveBeenNthCalledWith(2, 'testdb');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', { filter: {}, skip: 0, limit: 100 });
  });

  it('creates a collection in a placeholder database and clears the placeholder', async () => {
    mockApi.listCollections
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [{ name: 'users', type: 'collection' }] });
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'newdb', sizeOnDisk: 1024, empty: false }],
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [],
      ghostDatabases: ['newdb'],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    const databaseRow = screen.getByText('newdb').closest('button')!;
    await userEvent.click(databaseRow.querySelector('[aria-haspopup="menu"]')!);
    await userEvent.click(await screen.findByText('Create collection…'));
    await userEvent.type(screen.getByPlaceholderText('Collection name'), 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(useStore.getState().selectedCollection).toBe('users'));
    expect(useStore.getState().ghostDatabases).toEqual([]);
    expect(useStore.getState().databases.map((database) => database.name)).toContain('newdb');
  });

  it('uses collection names from the menu database for validation', async () => {
    mockApi.listCollections.mockResolvedValueOnce({ ok: true, data: [] });
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [
        { name: 'first-db', sizeOnDisk: 1024, empty: false },
        { name: 'second-db', sizeOnDisk: 1024, empty: false },
      ],
      expandedDb: 'first-db',
      selectedDb: 'first-db',
      collections: [{ name: 'users', type: 'collection' }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    const databaseRow = screen.getByText('second-db').closest('button')!;
    await userEvent.click(databaseRow.querySelector('[aria-haspopup="menu"]')!);
    await userEvent.click(await screen.findByText('Create collection…'));
    await userEvent.type(screen.getByPlaceholderText('Collection name'), 'users');

    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(mockApi.listCollections).toHaveBeenCalledWith('second-db');
  });

  it('keeps the create dialog open when the server rejects creation', async () => {
    mockApi.listCollections.mockResolvedValueOnce({ ok: true, data: [] });
    mockApi.createCollection.mockResolvedValueOnce({ ok: false, error: 'collection already exists' });
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    const databaseRow = screen.getByText('testdb').closest('button')!;
    await userEvent.click(databaseRow.querySelector('[aria-haspopup="menu"]')!);
    await userEvent.click(await screen.findByText('Create collection…'));
    const input = screen.getByPlaceholderText('Collection name');
    await userEvent.type(input, 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
    expect(input).toHaveValue('users');
    expect(useStore.getState().selectedCollection).toBeNull();
  });

  it('clears the projection after the selected collection is renamed', async () => {
    const projection = { name: 1 };
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'members', type: 'collection' }],
    });
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      expandedDb: 'testdb',
      selectedDb: 'testdb',
      selectedCollection: 'users',
      collections: [{ name: 'users', type: 'collection' }],
      projection,
    });

    render(<Sidebar width={240} onResize={() => {}} />);

    const collectionRow = screen.getByText('users').closest('[role="button"]')!;
    await userEvent.click(collectionRow.querySelector('button')!);
    await userEvent.click(await screen.findByText('Rename'));
    const input = screen.getByPlaceholderText('Collection name');
    await userEvent.clear(input);
    await userEvent.type(input, 'members');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(mockApi.renameCollection).toHaveBeenCalledWith('testdb', 'users', 'members'));
    expect(useStore.getState().selectedCollection).toBe('members');
    expect(useStore.getState().projection).toBeNull();
  });
});

describe('sidebar empty collection results', () => {
  beforeEach(async () => {
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      expandedDb: 'testdb',
      selectedDb: 'testdb',
      selectedCollection: 'users',
      collections: [{ name: 'users', type: 'collection', count: 41 }],
      projection: { name: 1 },
      queryMode: 'filter',
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 41 } });
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection', count: 0 }],
    });
    mockApi.emptyCollection.mockResolvedValue({ ok: true, data: 41 });
    await useStore.getState().runQuery('{ active: true }');
    await useStore.getState().setSort('name');
    await useStore.getState().fetchPage(20);
    mockApi.find.mockClear();
  });

  async function openEmptyDialog(): Promise<void> {
    const collectionRow = screen.getByText('users').closest('[role="button"]')!;
    await userEvent.click(collectionRow.querySelector('button')!);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Empty' }));
  }

  async function confirmEmpty(): Promise<void> {
    await userEvent.type(screen.getByRole('textbox', { name: /to confirm/i }), 'users');
    await userEvent.click(screen.getByRole('button', { name: 'Empty' }));
  }

  it('requires the exact collection name and refreshes the accepted filter page after emptying', async () => {
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [], totalCount: 0 } });
    render(<Sidebar width={240} onResize={() => {}} />);
    await openEmptyDialog();
    expect(screen.getByRole('button', { name: 'Empty' })).toBeDisabled();
    const input = screen.getByRole('textbox', { name: /to confirm/i });
    await userEvent.type(input, 'Users');
    expect(screen.getByRole('button', { name: 'Empty' })).toBeDisabled();
    expect(mockApi.emptyCollection).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await confirmEmpty();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults({ filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 }, [], 0)
    );
    expect(mockApi.emptyCollection).toHaveBeenCalledWith('testdb', 'users');
    expect(mockApi.aggregate).not.toHaveBeenCalled();
  });

  it('closes a successful empty dialog when the follow-up read fails while retaining the displayed page', async () => {
    const accepted = useStore.getState().acceptedResults;
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Read unavailable after empty' });
    render(<Sidebar width={240} onResize={() => {}} />);
    await openEmptyDialog();
    await confirmEmpty();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(useStore.getState()).toMatchObject({ loading: false, error: 'Read unavailable after empty' });
  });

  it('keeps a rejected empty action open and does not refresh or remove existing results', async () => {
    const accepted = useStore.getState().acceptedResults;
    mockApi.emptyCollection.mockResolvedValueOnce({ ok: false, error: 'Not authorized' });
    render(<Sidebar width={240} onResize={() => {}} />);
    await openEmptyDialog();
    await confirmEmpty();

    await waitFor(() => expect(mockApi.emptyCollection).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(mockApi.listCollections).not.toHaveBeenCalled();
  });

  it.each(['filter', 'aggregate'] as const)(
    'emptying preserves accepted aggregate output in %s editor mode without replay or fallback find',
    async (editorMode) => {
      const pipeline = [{ $match: { active: true } }, { $out: 'summary' }];
      useStore.getState().setQueryMode('aggregate');
      mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 41 }] });
      await useStore.getState().runQuery(JSON.stringify(pipeline));
      const snapshot = useStore.getState().acceptedResults;
      useStore.getState().setQueryMode(editorMode);
      mockApi.aggregate.mockClear();
      render(<Sidebar width={240} onResize={() => {}} />);
      await openEmptyDialog();
      await confirmEmpty();

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(useStore.getState().acceptedResults).toBe(snapshot);
      expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ total: 41 }]));
      expect(mockApi.aggregate).not.toHaveBeenCalled();
      expect(mockApi.find).not.toHaveBeenCalled();
    }
  );

  it('a pending empty action cannot refresh the newly selected collection or hide its query error', async () => {
    const write = deferred<Result<number>>();
    mockApi.emptyCollection.mockReturnValueOnce(write.promise);
    render(<Sidebar width={240} onResize={() => {}} />);
    await openEmptyDialog();
    await confirmEmpty();
    await act(async () => {
      mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ order: 7 }], totalCount: 1 } });
      await useStore.getState().selectCollection('testdb', 'orders');
      await useStore.getState().runQuery('{ invalid:');
    });
    const newer = useStore.getState().acceptedResults;
    const error = useStore.getState().error;
    mockApi.find.mockClear();

    await act(async () => {
      write.resolve({ ok: true, data: 41 });
      await write.promise;
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useStore.getState().acceptedResults).toBe(newer);
    expect(useStore.getState()).toMatchObject({ selectedCollection: 'orders', loading: false, error });
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(mockApi.emptyCollection).toHaveBeenCalledWith('testdb', 'users');
  });
});
