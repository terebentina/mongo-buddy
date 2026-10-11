import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore, selectConnected } from './store';
import type { ConnectionState, ConnectedSession, McpStatus, QueryHistoryEntry, Result } from '../../shared/types';

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onConnectionState: vi.fn<(cb: (s: ConnectionState) => void) => () => void>(() => () => {}),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  aggregate: vi.fn(),
  explain: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  deleteOne: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  sampleFields: vi.fn(),
  saveHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  distinct: vi.fn(),
  getMcpStatus: vi.fn<() => Promise<McpStatus>>().mockResolvedValue({ running: false, port: null }),
  onMcpStatusUpdate: vi.fn<(cb: (s: McpStatus) => void) => () => void>(() => () => {}),
  setWindowTitle: vi.fn(),
};

function makeSession(overrides: Partial<ConnectedSession> = {}): ConnectedSession {
  return {
    uri: 'mongodb://localhost',
    databases: [],
    queryHistory: [],
    collectionColumnWidths: {},
    autoSelectedDb: null,
    collections: [],
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockApi.onConnectionState.mockImplementation(() => () => {});
  mockApi.onMcpStatusUpdate.mockImplementation(() => () => {});
  mockApi.getMcpStatus.mockResolvedValue({ running: false, port: null });
  mockApi.saveHistory.mockResolvedValue(undefined);
  useStore.setState({
    status: { status: 'disconnected' } as ConnectionState,
    uri: '',
    databases: [],
    ghostDatabases: [],
    collections: [],
    expandedDb: null,
    selectedDb: null,
    selectedCollection: null,
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    projection: null,
    resultQueryMode: 'filter' as const,
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
    fieldNames: [],
    sort: null,
    pendingFilterText: null,
    queryHistory: [],
    collectionColumnWidths: {},
    historyIndex: null,
    pendingQueryMode: null,
    mcpStatus: { running: false, port: null },
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('store', () => {
  it('hydrates connection navigation and query history together', async () => {
    const historyEntries = [
      { id: '1', queryMode: 'filter' as const, query: '{}', db: 'test', collection: 'users', timestamp: 1000 },
    ];
    mockApi.connect.mockResolvedValue({
      ok: true,
      data: makeSession({
        uri: 'mongodb://localhost',
        databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
        queryHistory: historyEntries,
        collectionColumnWidths: { '["testdb","users"]': { name: 240 } },
        autoSelectedDb: 'testdb',
        collections: [{ name: 'users', type: 'collection' }],
      }),
    });

    await useStore.getState().connect('mongodb://localhost');

    const state = useStore.getState();
    expect(state.uri).toBe('mongodb://localhost');
    expect(state.databases).toEqual([{ name: 'testdb', sizeOnDisk: 1024, empty: false }]);
    expect(state.queryHistory).toEqual(historyEntries);
    expect(state.collectionColumnWidths).toEqual({ '["testdb","users"]': { name: 240 } });
    expect(state.expandedDb).toBe('testdb');
    expect(state.selectedDb).toBe('testdb');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
  });

  it('connect() multi-db session: autoSelectedDb null, collections empty, databases populated', async () => {
    mockApi.connect.mockResolvedValue({
      ok: true,
      data: makeSession({
        databases: [
          { name: 'db1', sizeOnDisk: 1024, empty: false },
          { name: 'db2', sizeOnDisk: 2048, empty: false },
        ],
        autoSelectedDb: null,
        collections: [],
      }),
    });

    await useStore.getState().connect('mongodb://localhost');

    const state = useStore.getState();
    expect(state.databases).toHaveLength(2);
    expect(state.selectedDb).toBeNull();
    expect(state.collections).toEqual([]);
  });

  it('connect failure sets error and leaves databases empty', async () => {
    mockApi.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });

    await useStore.getState().connect('mongodb://badhost');

    const state = useStore.getState();
    expect(selectConnected(state)).toBe(false);
    expect(state.error).toBe('Connection refused');
    expect(state.databases).toEqual([]);
  });

  it('selectDb(db) loads collections', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }],
    });

    await useStore.getState().selectDb('testdb');

    const state = useStore.getState();
    expect(state.expandedDb).toBe('testdb');
    expect(state.selectedDb).toBe('testdb');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb');
  });

  it('toggleDb(db) collapses an expanded database without clearing its selection', async () => {
    useStore.setState({
      expandedDb: 'testdb',
      selectedDb: 'testdb',
      selectedCollection: 'users',
      collections: [{ name: 'users', type: 'collection' }],
      docs: [{ _id: '1' }],
    });

    await useStore.getState().toggleDb('testdb');

    const state = useStore.getState();
    expect(state.expandedDb).toBeNull();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
    expect(state.docs).toEqual([{ _id: '1' }]);
    expect(mockApi.listCollections).not.toHaveBeenCalled();
  });

  it('selectCollection(db, coll) loads docs', async () => {
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 },
    });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });

    await useStore.getState().selectCollection('testdb', 'users');

    const state = useStore.getState();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.docs).toEqual([{ _id: '1', name: 'Alice' }]);
    expect(state.totalCount).toBe(1);
    expect(state.skip).toBe(0);
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: {},
      skip: 0,
      limit: 20,
    });
  });

  it('selectCollection resets filter to empty', async () => {
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });

    // Set a non-empty filter before switching collections
    useStore.setState({ filter: { status: 'active' }, pendingFilterText: '{"status":"active"}' });

    await useStore.getState().selectCollection('testdb', 'orders');

    const state = useStore.getState();
    expect(state.filter).toEqual({});
    expect(state.pendingFilterText).toBe('{}');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'orders', {
      filter: {},
      skip: 0,
      limit: 20,
    });
  });

  it('disconnect() resets derived state fields', async () => {
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });

    // Set some state first
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      uri: 'mongodb://localhost',
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });

    await useStore.getState().disconnect();

    const state = useStore.getState();
    expect(state.uri).toBe('');
    expect(state.databases).toEqual([]);
    expect(state.selectedDb).toBeNull();
    expect(state.selectedCollection).toBeNull();
    expect(state.docs).toEqual([]);
    expect(mockApi.disconnect).toHaveBeenCalled();
  });

  it('autoReconnect() connects with last used URI and applies session', async () => {
    mockApi.getLastUsed.mockResolvedValue('mongodb://localhost:27017');
    mockApi.connect.mockResolvedValue({
      ok: true,
      data: makeSession({
        uri: 'mongodb://localhost:27017',
        databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      }),
    });

    await useStore.getState().autoReconnect();

    expect(mockApi.getLastUsed).toHaveBeenCalled();
    expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
    expect(useStore.getState().databases).toHaveLength(1);
    expect(useStore.getState().uri).toBe('mongodb://localhost:27017');
  });

  it('autoReconnect() does nothing when no last used URI', async () => {
    mockApi.getLastUsed.mockResolvedValue(null);

    await useStore.getState().autoReconnect();

    expect(mockApi.connect).not.toHaveBeenCalled();
    expect(selectConnected(useStore.getState())).toBe(false);
  });

  it('runQuery() in filter mode calls find with parsed filter', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 },
    });

    await useStore.getState().runQuery('{"name":"Alice"}');

    const state = useStore.getState();
    expect(state.docs).toEqual([{ _id: '1', name: 'Alice' }]);
    expect(state.filter).toEqual({ name: 'Alice' });
    expect(state.skip).toBe(0);
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { name: 'Alice' },
      skip: 0,
      limit: 20,
    });
  });

  it('runQuery() in aggregate mode calls aggregate with parsed pipeline', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryMode: 'aggregate',
    });
    mockApi.aggregate.mockResolvedValue({
      ok: true,
      data: [{ _id: null, total: 42 }],
    });

    await useStore.getState().runQuery('[{"$group":{"_id":null,"total":{"$sum":1}}}]');

    const state = useStore.getState();
    expect(state.docs).toEqual([{ _id: null, total: 42 }]);
    expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', [{ $group: { _id: null, total: { $sum: 1 } } }]);
  });

  it('runQuery() adds entry to queryHistory after successful parse', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    await useStore.getState().runQuery('{"name":"Alice"}');

    const state = useStore.getState();
    expect(state.queryHistory).toHaveLength(1);
    expect(state.queryHistory[0].queryMode).toBe('filter');
    expect(state.queryHistory[0].query).toBe('{"name":"Alice"}');
    expect(state.queryHistory[0].db).toBe('testdb');
    expect(state.queryHistory[0].collection).toBe('users');
  });

  it('runQuery() returns error string for invalid JSON', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });

    const error = await useStore.getState().runQuery('{bad json}');

    expect(error).toBeTruthy();
    expect(typeof error).toBe('string');
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('insertDoc() calls insertOne and refreshes docs', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.insertOne.mockResolvedValue({ ok: true, data: { _id: '1', name: 'Alice' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 },
    });

    const error = await useStore.getState().insertDoc({ name: 'Alice' });

    expect(error).toBeNull();
    expect(mockApi.insertOne).toHaveBeenCalledWith('testdb', 'users', { name: 'Alice' });
    expect(mockApi.find).toHaveBeenCalled();
    expect(useStore.getState().docs).toEqual([{ _id: '1', name: 'Alice' }]);
  });

  it('insertDoc() returns error on failure', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.insertOne.mockResolvedValue({ ok: false, error: 'Duplicate key' });

    const error = await useStore.getState().insertDoc({ name: 'Alice' });

    expect(error).toBe('Duplicate key');
  });

  it('updateDoc() calls updateOne and refreshes docs', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.updateOne.mockResolvedValue({ ok: true, data: { _id: '1', name: 'Bob' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Bob' }], totalCount: 1 },
    });

    const error = await useStore.getState().updateDoc('1', { name: 'Bob' });

    expect(error).toBeNull();
    expect(mockApi.updateOne).toHaveBeenCalledWith('testdb', 'users', '1', { name: 'Bob' });
    expect(useStore.getState().docs).toEqual([{ _id: '1', name: 'Bob' }]);
  });

  it('updateManyDocs() refreshes docs and returns matched/modified counts', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter: { status: 'active' },
    });
    mockApi.updateMany.mockResolvedValue({ ok: true, data: { matchedCount: 3, modifiedCount: 2 } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', status: 'active', archived: true }], totalCount: 3 },
    });

    const result = await useStore.getState().updateManyDocs({ $set: { archived: true } }, {});

    expect(result).toEqual({ ok: true, data: { matchedCount: 3, modifiedCount: 2 } });
    expect(mockApi.find).toHaveBeenCalled();
    expect(useStore.getState().docs).toEqual([{ _id: '1', status: 'active', archived: true }]);
  });

  it('updateManyDocs() does not refresh when the update fails, returns the error Result', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter: {},
    });
    mockApi.updateMany.mockResolvedValue({ ok: false, error: 'Modifiers operate on fields' });

    const result = await useStore.getState().updateManyDocs({ archived: true }, {});

    expect(result).toEqual({ ok: false, error: 'Modifiers operate on fields' });
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('updateManyDocs() returns an error Result and skips the API when no collection selected', async () => {
    useStore.setState({ selectedDb: null, selectedCollection: null });

    const result = await useStore.getState().updateManyDocs({ $set: { a: 1 } }, {});

    expect(result.ok).toBe(false);
    expect(mockApi.updateMany).not.toHaveBeenCalled();
  });

  it('uses the applied filter and refreshes page one after the delete results action succeeds', async () => {
    const filter = { status: 'inactive', attempts: { $gte: 3 } };
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter,
      skip: 20,
      limit: 20,
      sort: { name: 1 },
    });
    mockApi.deleteMany.mockResolvedValue({ ok: true, data: 7 });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: '21' }], totalCount: 1 } });

    const result = await useStore.getState().deleteResults();

    expect(result).toEqual({ ok: true, data: 7 });
    expect(mockApi.deleteMany).toHaveBeenCalledWith('testdb', 'users', filter);
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter,
      skip: 0,
      limit: 20,
      sort: { name: 1 },
    });
    expect(useStore.getState().skip).toBe(0);
    expect(useStore.getState().docs).toEqual([{ _id: '21' }]);
  });

  it('does not refresh results when the delete results action fails', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter: { status: 'inactive' },
      skip: 20,
    });
    mockApi.deleteMany.mockResolvedValue({ ok: false, error: 'Delete failed' });

    const result = await useStore.getState().deleteResults();

    expect(result).toEqual({ ok: false, error: 'Delete failed' });
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(useStore.getState().skip).toBe(20);
  });

  it('skips the delete results API when no collection is selected', async () => {
    useStore.setState({ selectedDb: null, selectedCollection: null });

    const result = await useStore.getState().deleteResults();

    expect(result).toEqual({ ok: false, error: 'No collection selected' });
    expect(mockApi.deleteMany).not.toHaveBeenCalled();
  });

  it('deleteDoc() calls deleteOne and refreshes docs', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      docs: [{ _id: '1', name: 'Alice' }],
      totalCount: 1,
    });
    mockApi.deleteOne.mockResolvedValue({ ok: true, data: undefined });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    const error = await useStore.getState().deleteDoc('1');

    expect(error).toBeNull();
    expect(mockApi.deleteOne).toHaveBeenCalledWith('testdb', 'users', '1');
    expect(useStore.getState().docs).toEqual([]);
    expect(useStore.getState().totalCount).toBe(0);
  });
});

describe('projection', () => {
  const activeProjection = { name: 1, score: { $meta: 'textScore' } };

  beforeEach(() => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter: { active: true },
      projection: null,
      docs: [{ _id: 'old', name: 'Old' }],
      totalCount: 1,
      skip: 20,
      limit: 20,
      sort: { name: 1 },
      queryMode: 'filter',
    });
  });

  it('applies a JSON5 projection and keeps the current query position', async () => {
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 41 } });

    const error = await useStore.getState().applyProjection("{ name: 1, score: { $meta: 'textScore' } }");

    expect(error).toBeNull();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: true },
      projection: activeProjection,
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
    expect(useStore.getState().projection).toEqual(activeProjection);
    expect(useStore.getState().docs).toEqual([{ name: 'Alice' }]);
    expect(useStore.getState().totalCount).toBe(41);
  });

  it.each(['[]', 'null', '1', "'name'"])('rejects the non-document value %s before the request', async (text) => {
    const error = await useStore.getState().applyProjection(text);

    expect(error).toBe('Projection must be a JSON object');
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(useStore.getState().projection).toBeNull();
  });

  it('reports a JSON5 parse error before the request', async () => {
    const error = await useStore.getState().applyProjection('{ name:');

    expect(error).toBeTruthy();
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('keeps the prior projection and results when MongoDB rejects Apply', async () => {
    useStore.setState({ projection: { name: 1 } });
    mockApi.find.mockResolvedValue({ ok: false, error: 'Cannot mix inclusion and exclusion' });

    const error = await useStore.getState().applyProjection('{ name: 1, secret: 0 }');

    expect(error).toBe('Cannot mix inclusion and exclusion');
    expect(useStore.getState().projection).toEqual({ name: 1 });
    expect(useStore.getState().docs).toEqual([{ _id: 'old', name: 'Old' }]);
  });

  it('discards a late Apply response after a newer page request', async () => {
    const applyResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const pageResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(applyResponse.promise).mockReturnValueOnce(pageResponse.promise);

    const applyPromise = useStore.getState().applyProjection('{ name: 1 }');
    const pagePromise = useStore.getState().fetchPage(40);
    pageResponse.resolve({ ok: true, data: { docs: [{ _id: 'page' }], totalCount: 61 } });
    await pagePromise;
    applyResponse.resolve({ ok: true, data: { docs: [{ name: 'stale Apply' }], totalCount: 1 } });
    await applyPromise;

    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().docs).toEqual([{ _id: 'page' }]);
    expect(useStore.getState().skip).toBe(40);
  });

  it('discards a late Clear response after a newer page request', async () => {
    useStore.setState({ projection: activeProjection });
    const clearResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const pageResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(clearResponse.promise).mockReturnValueOnce(pageResponse.promise);

    const clearPromise = useStore.getState().clearProjection();
    const pagePromise = useStore.getState().fetchPage(40);
    pageResponse.resolve({ ok: true, data: { docs: [{ _id: 'page' }], totalCount: 61 } });
    await pagePromise;
    clearResponse.resolve({ ok: true, data: { docs: [{ _id: 'stale Clear' }], totalCount: 1 } });
    await clearPromise;

    expect(useStore.getState().projection).toEqual(activeProjection);
    expect(useStore.getState().docs).toEqual([{ _id: 'page' }]);
    expect(useStore.getState().skip).toBe(40);
  });

  it('discards a late Apply response after a newer sort request', async () => {
    const applyResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const sortResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(applyResponse.promise).mockReturnValueOnce(sortResponse.promise);

    const applyPromise = useStore.getState().applyProjection('{ name: 1 }');
    useStore.getState().setSort('age');
    sortResponse.resolve({ ok: true, data: { docs: [{ _id: 'sorted' }], totalCount: 1 } });
    await vi.waitFor(() => expect(useStore.getState().docs).toEqual([{ _id: 'sorted' }]));
    applyResponse.resolve({ ok: true, data: { docs: [{ name: 'stale Apply' }], totalCount: 1 } });
    await applyPromise;

    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().docs).toEqual([{ _id: 'sorted' }]);
    expect(useStore.getState().sort).toEqual({ age: 1 });
  });

  it('discards a late Clear response after a newer sort request', async () => {
    useStore.setState({ projection: activeProjection });
    const clearResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const sortResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(clearResponse.promise).mockReturnValueOnce(sortResponse.promise);

    const clearPromise = useStore.getState().clearProjection();
    useStore.getState().setSort('age');
    sortResponse.resolve({ ok: true, data: { docs: [{ _id: 'sorted' }], totalCount: 1 } });
    await vi.waitFor(() => expect(useStore.getState().docs).toEqual([{ _id: 'sorted' }]));
    clearResponse.resolve({ ok: true, data: { docs: [{ _id: 'stale Clear' }], totalCount: 1 } });
    await clearPromise;

    expect(useStore.getState().projection).toEqual(activeProjection);
    expect(useStore.getState().docs).toEqual([{ _id: 'sorted' }]);
    expect(useStore.getState().sort).toEqual({ age: 1 });
  });

  it('discards a late Apply response after a newer collection request', async () => {
    const applyResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const collectionResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(applyResponse.promise).mockReturnValueOnce(collectionResponse.promise);
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });

    const applyPromise = useStore.getState().applyProjection('{ name: 1 }');
    const collectionPromise = useStore.getState().selectCollection('testdb', 'orders');
    collectionResponse.resolve({ ok: true, data: { docs: [{ _id: 'order' }], totalCount: 1 } });
    await collectionPromise;
    applyResponse.resolve({ ok: true, data: { docs: [{ name: 'stale Apply' }], totalCount: 1 } });
    await applyPromise;

    expect(useStore.getState().selectedCollection).toBe('orders');
    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().docs).toEqual([{ _id: 'order' }]);
  });

  it('discards a late Clear response after a newer collection request', async () => {
    useStore.setState({ projection: activeProjection });
    const clearResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    const collectionResponse = deferred<{
      ok: true;
      data: { docs: Record<string, unknown>[]; totalCount: number };
    }>();
    mockApi.find.mockReturnValueOnce(clearResponse.promise).mockReturnValueOnce(collectionResponse.promise);
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });

    const clearPromise = useStore.getState().clearProjection();
    const collectionPromise = useStore.getState().selectCollection('testdb', 'orders');
    collectionResponse.resolve({ ok: true, data: { docs: [{ _id: 'order' }], totalCount: 1 } });
    await collectionPromise;
    clearResponse.resolve({ ok: true, data: { docs: [{ _id: 'stale Clear' }], totalCount: 1 } });
    await clearPromise;

    expect(useStore.getState().selectedCollection).toBe('orders');
    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().docs).toEqual([{ _id: 'order' }]);
  });

  it('updates the result QueryMode only after a successful request replaces the rows', async () => {
    useStore.setState({ resultQueryMode: 'filter', queryMode: 'aggregate' });
    mockApi.aggregate.mockResolvedValueOnce({ ok: false, error: 'Aggregate failed' });

    await useStore.getState().runQuery('[{ $match: {} }]');

    expect(useStore.getState().resultQueryMode).toBe('filter');

    mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ _id: 'aggregate' }] });
    await useStore.getState().runQuery('[{ $match: {} }]');

    expect(useStore.getState().resultQueryMode).toBe('aggregate');
  });

  it('treats an empty projection as no projection', async () => {
    useStore.setState({ projection: { name: 1 } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'full' }], totalCount: 1 } });

    const error = await useStore.getState().applyProjection('{}');

    expect(error).toBeNull();
    expect(useStore.getState().projection).toBeNull();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: true },
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
  });

  it('Clear removes the projection and reloads Filter results', async () => {
    useStore.setState({ projection: activeProjection });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'full' }], totalCount: 1 } });

    const error = await useStore.getState().clearProjection();

    expect(error).toBeNull();
    expect(useStore.getState().projection).toBeNull();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: true },
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
  });

  it('does not send the projection to Aggregate or Explain', async () => {
    useStore.setState({ projection: activeProjection, queryMode: 'aggregate' });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [] });
    mockApi.explain.mockResolvedValue({ ok: true, data: {} });

    await useStore.getState().runQuery('[{ $match: {} }]');
    await useStore.getState().runExplain('[{ $match: {} }]');

    expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', [{ $match: {} }]);
    expect(mockApi.explain).toHaveBeenCalledWith('testdb', 'users', 'aggregate', [{ $match: {} }]);
    expect(useStore.getState().projection).toEqual(activeProjection);
  });

  it('restores the projection when Filter mode runs again', async () => {
    useStore.setState({ projection: activeProjection, queryMode: 'aggregate' });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    useStore.getState().setQueryMode('filter');
    await useStore.getState().runQuery('{ active: false }');

    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: false },
      projection: activeProjection,
      skip: 0,
      limit: 20,
    });
  });

  it('uses the projection for pagination, sorting, limit changes, refreshes, and filter value actions', async () => {
    useStore.setState({ projection: activeProjection });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().fetchPage(40);
    useStore.getState().setSort('age');
    useStore.getState().setLimit(50);
    await useStore.getState().refreshDocs();
    useStore.getState().applyFilterValue('status', 'active', 'include');

    expect(mockApi.find).toHaveBeenCalledTimes(5);
    for (const call of mockApi.find.mock.calls) {
      expect(call[2]).toMatchObject({ projection: activeProjection });
    }
  });

  it('keeps the projection for history on the same collection', async () => {
    useStore.setState({
      projection: activeProjection,
      queryHistory: [
        {
          id: 'same',
          queryMode: 'filter',
          query: '{ active: false }',
          db: 'testdb',
          collection: 'users',
          timestamp: 1,
        },
      ],
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(useStore.getState().queryHistory[0]);

    expect(useStore.getState().projection).toEqual(activeProjection);
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: false },
      projection: activeProjection,
      skip: 0,
      limit: 20,
    });
    expect(useStore.getState().queryHistory[0]).not.toHaveProperty('projection');
  });

  it('clears the projection for history on a different collection', async () => {
    useStore.setState({
      projection: activeProjection,
      queryHistory: [
        {
          id: 'other',
          queryMode: 'filter',
          query: '{}',
          db: 'testdb',
          collection: 'orders',
          timestamp: 1,
        },
      ],
    });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(useStore.getState().queryHistory[0]);

    expect(useStore.getState().projection).toBeNull();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'orders', { filter: {}, skip: 0, limit: 20 });
  });

  it('clears the projection after a database change, collection change, disconnect, and ghost database removal', async () => {
    mockApi.listCollections.mockResolvedValue({ ok: true, data: [] });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });

    await useStore.getState().selectDb('otherdb');
    expect(useStore.getState().projection).toBeNull();

    useStore.setState({ projection: activeProjection });
    await useStore.getState().selectCollection('otherdb', 'orders');
    expect(useStore.getState().projection).toBeNull();

    useStore.setState({ projection: activeProjection });
    await useStore.getState().disconnect();
    expect(useStore.getState().projection).toBeNull();

    useStore.setState({
      projection: activeProjection,
      ghostDatabases: ['ghost'],
      selectedDb: 'ghost',
      selectedCollection: 'items',
    });
    useStore.getState().removeGhostDatabase('ghost');
    expect(useStore.getState().projection).toBeNull();
  });

  it('loads the complete document by its original _id without a projection', async () => {
    useStore.setState({ projection: activeProjection });
    const complete = { _id: 'original', name: 'Alice', secret: true };
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [complete], totalCount: 1 } });

    const result = await useStore.getState().loadDocument('original');

    expect(result).toEqual({ ok: true, data: complete });
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { _id: 'original' },
      skip: 0,
      limit: 1,
    });
  });

  it('does not return a document when the complete document load fails', async () => {
    mockApi.find.mockResolvedValue({ ok: false, error: 'Load failed' });

    const result = await useStore.getState().loadDocument('original');

    expect(result).toEqual({ ok: false, error: 'Load failed' });
  });
});

describe('query attempt history', () => {
  beforeEach(() => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    mockApi.find.mockResolvedValue({ ok: false, error: 'Controlled query failure' });
  });

  it('records attempted queries before replies, including failed attempts', async () => {
    const response = deferred<{ ok: false; error: string }>();
    mockApi.find.mockReturnValueOnce(response.promise);
    const attempt = useStore.getState().runQuery('{ name: "Alice" }');
    expect(useStore.getState().queryHistory).toMatchObject([
      { db: 'testdb', collection: 'users', queryMode: 'filter', query: '{ name: "Alice" }' },
    ]);
    expect(useStore.getState().historyIndex).toBe(0);

    response.resolve({ ok: false, error: 'Controlled query failure' });
    await attempt;
    await useStore.getState().runQuery('{ age: 30 }');
    expect(useStore.getState().queryHistory.map((entry) => entry.query)).toEqual(['{ age: 30 }', '{ name: "Alice" }']);
  });

  it('deduplicates only the top matching attempt and returns the cursor to it', async () => {
    await useStore.getState().runQuery('{}');
    const first = useStore.getState().queryHistory[0];
    useStore.setState({ historyIndex: 3 });
    await useStore.getState().runQuery('{}');
    expect(useStore.getState().queryHistory).toEqual([first]);
    expect(useStore.getState().historyIndex).toBe(0);

    await useStore.getState().runQuery('{ age: 30 }');
    await useStore.getState().runQuery('{}');
    expect(useStore.getState().queryHistory.map((entry) => entry.query)).toEqual(['{}', '{ age: 30 }', '{}']);
  });

  it('retains the latest 50 attempts', async () => {
    for (let i = 0; i < 55; i++) await useStore.getState().runQuery(`{ i: ${i} }`);
    expect(useStore.getState().queryHistory).toHaveLength(50);
    expect(useStore.getState().queryHistory[0].query).toBe('{ i: 54 }');
    expect(useStore.getState().queryHistory[49].query).toBe('{ i: 5 }');
  });
});

describe('historyIndex + navigateHistory', () => {
  const makeEntry = (
    overrides = {}
  ): {
    id: string;
    queryMode: 'filter' | 'aggregate';
    query: string;
    db: string;
    collection: string;
    timestamp: number;
  } => ({
    id: 'test-id',
    queryMode: 'filter' as const,
    query: '{"name":"Alice"}',
    db: 'testdb',
    collection: 'users',
    timestamp: 1000,
    ...overrides,
  });

  it('restoreFromHistory does NOT add a duplicate entry when restoring index > 0', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    const b = makeEntry({ id: 'b', query: '{"b":2}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a, b],
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(b);

    expect(useStore.getState().queryHistory).toHaveLength(2);
    expect(useStore.getState().queryHistory[0].id).toBe('a');
    expect(useStore.getState().queryHistory[1].id).toBe('b');
  });

  it('navigateHistory(1) from null with non-empty history restores index 0', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a],
      historyIndex: null,
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().navigateHistory(1);

    expect(useStore.getState().historyIndex).toBe(0);
    expect(useStore.getState().pendingFilterText).toBe('{"a":1}');
  });

  it('navigateHistory(1) from index 0 moves to index 1', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    const b = makeEntry({ id: 'b', query: '{"b":2}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a, b],
      historyIndex: 0,
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().navigateHistory(1);

    expect(useStore.getState().historyIndex).toBe(1);
    expect(useStore.getState().pendingFilterText).toBe('{"b":2}');
  });

  it('navigateHistory(-1) from index 1 moves to index 0', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    const b = makeEntry({ id: 'b', query: '{"b":2}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a, b],
      historyIndex: 1,
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().navigateHistory(-1);

    expect(useStore.getState().historyIndex).toBe(0);
    expect(useStore.getState().pendingFilterText).toBe('{"a":1}');
  });

  it('navigateHistory(1) clamps at last index (no underflow past oldest)', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    const b = makeEntry({ id: 'b', query: '{"b":2}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a, b],
      historyIndex: 1,
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().navigateHistory(1);

    expect(useStore.getState().historyIndex).toBe(1);
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('navigateHistory(-1) clamps at index 0', async () => {
    const a = makeEntry({ id: 'a', query: '{"a":1}' });
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a],
      historyIndex: 0,
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().navigateHistory(-1);

    expect(useStore.getState().historyIndex).toBe(0);
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('navigateHistory is a no-op on empty history', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [],
      historyIndex: null,
    });

    await useStore.getState().navigateHistory(1);

    expect(useStore.getState().historyIndex).toBeNull();
    expect(useStore.getState().queryHistory).toEqual([]);
    expect(mockApi.find).not.toHaveBeenCalled();
  });
});

describe('restoreFromHistory', () => {
  const makeEntry = (overrides = {}) => ({
    id: 'test-id',
    queryMode: 'filter' as const,
    query: '{"name":"Alice"}',
    db: 'testdb',
    collection: 'users',
    timestamp: 1000,
    ...overrides,
  });

  it('same collection sets pendingFilterText and pendingQueryMode without calling sampleFields', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', projection: { name: 1 } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });

    await useStore.getState().restoreFromHistory(makeEntry());

    const state = useStore.getState();
    expect(state.pendingFilterText).toBe('{"name":"Alice"}');
    expect(state.pendingQueryMode).toBe('filter');
    expect(state.projection).toEqual({ name: 1 });
    expect(mockApi.sampleFields).not.toHaveBeenCalled();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { name: 'Alice' },
      projection: { name: 1 },
      skip: 0,
      limit: 20,
    });
    expect(state.docs).toEqual([{ name: 'Alice' }]);
    expect(state.totalCount).toBe(1);
  });

  it('different collection clears projection and restores its query and fields', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'orders', projection: { orderId: 1 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });

    await useStore.getState().restoreFromHistory(makeEntry());

    const state = useStore.getState();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.projection).toBeNull();
    expect(state.pendingFilterText).toBe('{"name":"Alice"}');
    expect(state.pendingQueryMode).toBe('filter');
    expect(mockApi.sampleFields).toHaveBeenCalledWith('testdb', 'users');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', { filter: { name: 'Alice' }, skip: 0, limit: 20 });
  });

  it('aggregate entry sets pendingQueryMode to aggregate and executes', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [{ _id: 1 }] });

    await useStore.getState().restoreFromHistory(makeEntry({ queryMode: 'aggregate', query: '[{"$match":{}}]' }));

    const state = useStore.getState();
    expect(state.pendingQueryMode).toBe('aggregate');
    expect(state.pendingFilterText).toBe('[{"$match":{}}]');
    expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', [{ $match: {} }]);
    expect(state.docs).toEqual([{ _id: 1 }]);
    expect(state.totalCount).toBe(1);
  });

  it('filter entry syncs filter state to parsed query', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', filter: { old: 'stale' } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(makeEntry({ query: '{"name":"Alice"}' }));

    expect(useStore.getState().filter).toEqual({ name: 'Alice' });
  });

  it('aggregate entry resets filter to empty object', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', filter: { old: 'stale' } });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [] });

    await useStore.getState().restoreFromHistory(makeEntry({ queryMode: 'aggregate', query: '[{"$match":{}}]' }));

    expect(useStore.getState().filter).toEqual({});
  });

  it('the filter value action uses a restored empty filter', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', filter: { status: 'active' } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(makeEntry({ query: '{}' }));
    useStore.getState().applyFilterValue('name', 'Bob', 'include');

    expect(useStore.getState().filter).toEqual({ name: 'Bob' });
  });
});

describe('filter value action', () => {
  it.each([
    ['include' as const, 'active'],
    ['exclude' as const, { $ne: 'active' }],
  ])('applies the %s action and runs the new query', (action, condition) => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      filter: {},
      skip: 40,
      queryHistory: [],
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    useStore.getState().applyFilterValue('status', 'active', action);

    const filter = { status: condition };
    const query = JSON.stringify(filter, null, 2);
    const state = useStore.getState();
    expect(state.filter).toEqual(filter);
    expect(state.skip).toBe(0);
    expect(state.pendingFilterText).toBe(query);
    expect(state.pendingQueryMode).toBe('filter');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter,
      skip: 0,
      limit: 20,
      sort: undefined,
    });
    expect(state.queryHistory[0]).toMatchObject({
      queryMode: 'filter',
      query,
      db: 'testdb',
      collection: 'users',
    });
  });
});

describe('fetchDistinct', () => {
  it('calls window.api.distinct with current db, collection, and field', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    const apiResult = { ok: true as const, data: { values: ['active', 'inactive'], truncated: false } };
    mockApi.distinct.mockResolvedValue(apiResult);

    const result = await useStore.getState().fetchDistinct('status');

    expect(mockApi.distinct).toHaveBeenCalledWith('testdb', 'users', 'status', undefined);
    expect(result).toEqual(apiResult);
  });

  it('forwards filter arg to window.api.distinct', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    const apiResult = { ok: true as const, data: { values: ['active'], truncated: false } };
    mockApi.distinct.mockResolvedValue(apiResult);

    await useStore.getState().fetchDistinct('status', { age: 1 });

    expect(mockApi.distinct).toHaveBeenCalledWith('testdb', 'users', 'status', { age: 1 });
  });

  it('returns null when no collection selected', async () => {
    useStore.setState({ selectedDb: null, selectedCollection: null });

    const result = await useStore.getState().fetchDistinct('status');

    expect(result).toBeNull();
    expect(mockApi.distinct).not.toHaveBeenCalled();
  });
});

describe('connection-scoped column preferences', () => {
  it('retains preferences on same-connection broadcasts but clears them on replacement and disconnect', () => {
    let emit: (s: ConnectionState) => void = () => {};
    mockApi.onConnectionState.mockImplementation((cb) => {
      emit = cb;
      return () => {};
    });
    const widths = { '["testdb","users"]': { name: 240 } };
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      collectionColumnWidths: widths,
    });
    const unsubscribe = useStore.getState().subscribeToConnectionState();
    emit({ status: 'connected', uri: 'mongodb://other-user@localhost', connectionKey: 'localhost:27017' });
    expect(useStore.getState().collectionColumnWidths).toEqual(widths);
    emit({ status: 'connected', uri: 'mongodb://elsewhere', connectionKey: 'elsewhere:27017' });
    expect(useStore.getState().collectionColumnWidths).toEqual({});
    useStore.setState({ collectionColumnWidths: widths });
    emit({ status: 'disconnected' });
    expect(useStore.getState().collectionColumnWidths).toEqual({});
    unsubscribe();
  });
});

describe('initMcpStatus', () => {
  it('subscribes to updates and hydrates from getMcpStatus', async () => {
    let emit: (s: McpStatus) => void = () => {};
    mockApi.onMcpStatusUpdate.mockImplementation((cb: (s: McpStatus) => void) => {
      emit = cb;
      return () => {};
    });
    mockApi.getMcpStatus.mockResolvedValue({ running: true, port: 27099 });

    useStore.getState().initMcpStatus();

    expect(mockApi.onMcpStatusUpdate).toHaveBeenCalledTimes(1);
    expect(mockApi.getMcpStatus).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(useStore.getState().mcpStatus).toEqual({ running: true, port: 27099 });
    });

    emit({ running: false, port: null });
    expect(useStore.getState().mcpStatus).toEqual({ running: false, port: null });

    emit({ running: true, port: 9999 });
    expect(useStore.getState().mcpStatus).toEqual({ running: true, port: 9999 });
  });

  it('returns the unsubscribe function from onMcpStatusUpdate', () => {
    const unsubSpy = vi.fn();
    mockApi.onMcpStatusUpdate.mockImplementation(() => unsubSpy);

    const unsub = useStore.getState().initMcpStatus();
    unsub();

    expect(unsubSpy).toHaveBeenCalledTimes(1);
  });
});

describe('selectConnected', () => {
  it('is false for every other status', () => {
    const states: ConnectionState[] = [
      { status: 'disconnected' },
      { status: 'connecting', uri: 'u' },
      { status: 'error', uri: 'u', error: 'e' },
    ];
    for (const s of states) {
      expect(selectConnected({ status: s } as unknown as ReturnType<typeof useStore.getState>)).toBe(false);
    }
  });
});

describe('ghost databases', () => {
  it('addGhostDatabase is a no-op when name already in ghost set', () => {
    useStore.setState({ ghostDatabases: ['newdb'] });
    useStore.getState().addGhostDatabase('newdb');
    expect(useStore.getState().ghostDatabases).toEqual(['newdb']);
  });

  it('removeGhostDatabase clears selection state if removing currently-selected ghost', () => {
    useStore.setState({
      ghostDatabases: ['ghosty'],
      selectedDb: 'ghosty',
      selectedCollection: 'whatever',
      collections: [{ name: 'whatever', type: 'collection' }],
    });
    useStore.getState().removeGhostDatabase('ghosty');
    const state = useStore.getState();
    expect(state.ghostDatabases).toEqual([]);
    expect(state.selectedDb).toBeNull();
    expect(state.selectedCollection).toBeNull();
    expect(state.collections).toEqual([]);
  });

  it('removeGhostDatabase preserves selection when a different db is selected', () => {
    useStore.setState({
      ghostDatabases: ['ghosty'],
      selectedDb: 'realdb',
      selectedCollection: 'users',
    });
    useStore.getState().removeGhostDatabase('ghosty');
    const state = useStore.getState();
    expect(state.selectedDb).toBe('realdb');
    expect(state.selectedCollection).toBe('users');
  });

  it('disconnect() clears ghostDatabases', async () => {
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
    useStore.setState({ ghostDatabases: ['ghosty', 'spooky'] });

    await useStore.getState().disconnect();

    expect(useStore.getState().ghostDatabases).toEqual([]);
  });

  it('connect() clears any existing ghostDatabases', async () => {
    useStore.setState({ ghostDatabases: ['stale-ghost'] });
    mockApi.connect.mockResolvedValue({
      ok: true,
      data: makeSession({ databases: [{ name: 'realdb', sizeOnDisk: 1, empty: false }] }),
    });

    await useStore.getState().connect('mongodb://localhost');

    expect(useStore.getState().ghostDatabases).toEqual([]);
  });

  it('refreshDatabases() calls listDatabases and updates databases', async () => {
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'newone', sizeOnDisk: 100, empty: false }],
    });

    await useStore.getState().refreshDatabases();

    expect(mockApi.listDatabases).toHaveBeenCalled();
    expect(useStore.getState().databases).toEqual([{ name: 'newone', sizeOnDisk: 100, empty: false }]);
  });

  it('refreshDatabases() leaves state unchanged when IPC fails', async () => {
    useStore.setState({ databases: [{ name: 'old', sizeOnDisk: 1, empty: false }] });
    mockApi.listDatabases.mockResolvedValue({ ok: false, error: 'network' });

    await useStore.getState().refreshDatabases();

    expect(useStore.getState().databases).toEqual([{ name: 'old', sizeOnDisk: 1, empty: false }]);
  });
});

describe('collection selection ownership', () => {
  const rows = (label: string) => ({ ok: true as const, data: { docs: [{ label }], totalCount: 1 } });
  const fields = (label: string) => ({ ok: true as const, data: [label] });
  const historyEntry = (id: string, overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry => ({
    id,
    db: 'testdb',
    collection: 'users',
    queryMode: 'filter',
    query: `{ label: "${id}" }`,
    timestamp: 1,
    ...overrides,
  });
  const connected: ConnectionState = {
    status: 'connected',
    uri: 'mongodb://localhost',
    connectionKey: 'localhost:27017',
  };

  it('keeps the newer selection attempt and pending rows when older connection history hydrates', async () => {
    let emit!: (state: ConnectionState) => void;
    mockApi.onConnectionState.mockImplementation((cb) => {
      emit = cb;
      return () => {};
    });
    const unsubscribe = useStore.getState().subscribeToConnectionState();
    const connectReply = deferred<Result<ConnectedSession>>();
    const rowReply = deferred<ReturnType<typeof rows>>();
    const persisted = historyEntry('persisted', { collection: 'orders' });
    const widths = { '["testdb","users"]': { name: 240 } };
    useStore.setState({ queryHistory: [historyEntry('previous connection')], historyIndex: 0 });
    mockApi.connect.mockReturnValueOnce(connectReply.promise);
    mockApi.find.mockReturnValueOnce(rowReply.promise);
    mockApi.sampleFields.mockResolvedValueOnce(fields('name'));
    const connection = useStore.getState().connect('mongodb://localhost');
    emit({ status: 'connecting', uri: 'mongodb://localhost' });
    emit(connected);
    const selection = useStore.getState().selectCollection('testdb', 'users');
    const attempt = useStore.getState().queryHistory[0];
    expect(attempt).toMatchObject({ db: 'testdb', collection: 'users', query: '{}' });

    connectReply.resolve({
      ok: true,
      data: makeSession({
        queryHistory: [persisted],
        collectionColumnWidths: widths,
        autoSelectedDb: 'archive',
        collections: [{ name: 'orders', type: 'collection' }],
      }),
    });
    await connection;
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      pendingFilterText: '{}',
      queryMode: 'filter',
      queryHistory: [attempt, persisted],
      historyIndex: 0,
      loading: true,
      collectionColumnWidths: widths,
    });
    expect(mockApi.saveHistory).toHaveBeenLastCalledWith([attempt, persisted]);

    rowReply.resolve(rows('newly selected users'));
    await selection;
    expect(useStore.getState()).toMatchObject({
      loading: false,
      docs: [{ label: 'newly selected users' }],
      totalCount: 1,
      queryHistory: [attempt, persisted],
      historyIndex: 0,
    });
    unsubscribe();
  });

  it.each(['same query', 'same id'] as const)(
    'reconciles %s history overlap while retaining the replay cursor, distinct attempts and the 50-entry cap',
    async (overlap) => {
      let emit!: (state: ConnectionState) => void;
      mockApi.onConnectionState.mockImplementation((cb) => {
        emit = cb;
        return () => {};
      });
      const unsubscribe = useStore.getState().subscribeToConnectionState();
      const connectReply = deferred<Result<ConnectedSession>>();
      mockApi.connect.mockReturnValueOnce(connectReply.promise);
      mockApi.find.mockResolvedValue(rows('query rows'));
      mockApi.sampleFields.mockResolvedValue(fields('name'));
      const connection = useStore.getState().connect('mongodb://localhost');
      emit({ status: 'connecting', uri: 'mongodb://localhost' });
      emit(connected);
      await useStore.getState().selectCollection('testdb', 'users');
      const initialAttempt = useStore.getState().queryHistory[0];
      await useStore.getState().runQuery('{ active: true }');
      const latestAttempt = useStore.getState().queryHistory[0];
      await useStore.getState().restoreFromHistory(initialAttempt);
      expect(useStore.getState().historyIndex).toBe(1);
      expect(mockApi.saveHistory).toHaveBeenCalledTimes(2);

      const duplicate = overlap === 'same id' ? initialAttempt : historyEntry('duplicate', { query: '{}' });
      const repeated = historyEntry('earlier active attempt', { query: '{ active: true }' });
      const older = Array.from({ length: 48 }, (_, index) =>
        historyEntry('persisted-' + index, { collection: 'orders' })
      );
      connectReply.resolve({ ok: true, data: makeSession({ queryHistory: [duplicate, repeated, ...older] }) });
      await connection;

      const reconciled = [latestAttempt, initialAttempt, repeated, ...older.slice(0, 47)];
      expect(useStore.getState().queryHistory).toEqual(reconciled);
      expect(useStore.getState().queryHistory).toHaveLength(50);
      expect(useStore.getState()).toMatchObject({
        selectedCollection: 'users',
        historyIndex: 1,
        pendingFilterText: '{}',
        queryMode: 'filter',
      });
      expect(mockApi.saveHistory).toHaveBeenLastCalledWith(reconciled);
      const saves = mockApi.saveHistory.mock.calls.length;
      await useStore.getState().navigateHistory(1);
      expect(useStore.getState()).toMatchObject({ historyIndex: 2, pendingFilterText: repeated.query });
      expect(useStore.getState().queryHistory).toEqual(reconciled);
      expect(mockApi.saveHistory).toHaveBeenCalledTimes(saves);
      unsubscribe();
    }
  );

  it('clearing a paused projection lets the pending same-collection Aggregate replay settle', async () => {
    const entry = historyEntry('aggregate', { queryMode: 'aggregate', query: '[{ $match: { active: true } }]' });
    const reply = deferred<Result<Record<string, unknown>[]>>();
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      projection: { name: 1 },
      queryHistory: [entry],
    });
    mockApi.aggregate.mockReturnValueOnce(reply.promise);
    const replay = useStore.getState().restoreFromHistory(entry);
    expect(useStore.getState()).toMatchObject({ loading: true, queryMode: 'aggregate', projection: { name: 1 } });

    expect(await useStore.getState().clearProjection()).toBeNull();
    expect(useStore.getState()).toMatchObject({ loading: true, projection: null });
    reply.resolve({ ok: true, data: [{ name: 'Active user', active: true }] });
    await replay;

    expect(useStore.getState()).toMatchObject({
      loading: false,
      docs: [{ name: 'Active user', active: true }],
      totalCount: 1,
      projection: null,
      queryMode: 'aggregate',
      resultQueryMode: 'aggregate',
      pendingFilterText: entry.query,
      historyIndex: 0,
    });
    expect(useStore.getState().queryHistory).toEqual([entry]);
    expect(mockApi.find).not.toHaveBeenCalled();
    expect(mockApi.saveHistory).not.toHaveBeenCalled();
  });

  it('changes selection and title immediately and keeps old rows cleared after an initial load fails', async () => {
    const reply = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    const fieldReply = deferred<Result<string[]>>();
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      docs: [{ label: 'old' }],
      totalCount: 12,
      projection: { name: 1 },
      fieldNames: ['old'],
      resultQueryMode: 'aggregate',
      error: 'old error',
    });
    mockApi.find.mockReturnValueOnce(reply.promise);
    mockApi.sampleFields.mockReturnValueOnce(fieldReply.promise);
    const selection = useStore.getState().selectCollection('testdb', 'orders');

    expect(useStore.getState()).toMatchObject({
      selectedDb: 'testdb',
      selectedCollection: 'orders',
      docs: [],
      totalCount: 0,
      projection: null,
      fieldNames: [],
      resultQueryMode: 'filter',
      error: null,
      queryMode: 'filter',
      pendingFilterText: '{}',
      pendingQueryMode: 'filter',
      historyIndex: 0,
    });
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'testdb.orders' });
    reply.resolve({ ok: false, error: 'Initial load failed' });
    await Promise.resolve();
    expect(useStore.getState()).toMatchObject({
      docs: [],
      totalCount: 0,
      loading: false,
      error: 'Initial load failed',
    });
    fieldReply.resolve(fields('orderId'));
    await selection;
    expect(useStore.getState()).toMatchObject({
      selectedCollection: 'orders',
      docs: [],
      totalCount: 0,
      error: 'Initial load failed',
      fieldNames: ['orderId'],
    });
    expect(useStore.getState().queryHistory[0]).toMatchObject({ collection: 'orders', query: '{}' });
  });

  it('ignores older rows and fields even when selection returns to the same collection', async () => {
    const replies = [
      deferred<ReturnType<typeof rows>>(),
      deferred<ReturnType<typeof rows>>(),
      deferred<ReturnType<typeof rows>>(),
    ];
    const fieldReplies = [
      deferred<ReturnType<typeof fields>>(),
      deferred<ReturnType<typeof fields>>(),
      deferred<ReturnType<typeof fields>>(),
    ];
    for (const reply of replies) mockApi.find.mockReturnValueOnce(reply.promise);
    for (const reply of fieldReplies) mockApi.sampleFields.mockReturnValueOnce(reply.promise);
    const a = useStore.getState().selectCollection('testdb', 'users');
    const b = useStore.getState().selectCollection('testdb', 'orders');
    const latest = useStore.getState().selectCollection('testdb', 'users');
    replies[2].resolve(rows('latest users'));
    fieldReplies[2].resolve(fields('latest user field'));
    await latest;
    replies[1].resolve(rows('old orders'));
    fieldReplies[1].resolve(fields('old order field'));
    replies[0].resolve(rows('old users'));
    fieldReplies[0].resolve(fields('old user field'));
    await Promise.all([a, b]);
    expect(useStore.getState()).toMatchObject({
      selectedCollection: 'users',
      docs: [{ label: 'latest users' }],
      fieldNames: ['latest user field'],
      totalCount: 1,
      loading: false,
      historyIndex: 0,
    });
    expect(useStore.getState().queryHistory.map((entry) => entry.collection)).toEqual(['users', 'orders', 'users']);
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'testdb.users' });
  });

  it.each(['query', 'page'] as const)(
    'retains delayed field discovery across a newer same-collection %s',
    async (action) => {
      const initialReply = deferred<ReturnType<typeof rows>>();
      const fieldReply = deferred<ReturnType<typeof fields>>();
      mockApi.find.mockReturnValueOnce(initialReply.promise).mockResolvedValueOnce(rows('newer rows'));
      mockApi.sampleFields.mockReturnValueOnce(fieldReply.promise);
      const selection = useStore.getState().selectCollection('testdb', 'users');
      if (action === 'query') await useStore.getState().runQuery('{ active: true }');
      else await useStore.getState().fetchPage(20);
      expect(useStore.getState()).toMatchObject({ docs: [{ label: 'newer rows' }], fieldNames: [], loading: false });
      initialReply.resolve(rows('superseded initial rows'));
      fieldReply.resolve(fields('valid user field'));
      await selection;
      expect(useStore.getState()).toMatchObject({
        docs: [{ label: 'newer rows' }],
        fieldNames: ['valid user field'],
        skip: action === 'page' ? 20 : 0,
      });
    }
  );

  it('replays history at intent time and keeps a newer selection after the older replay completes', async () => {
    const old = historyEntry('old', { db: 'archive' });
    const oldRows = deferred<ReturnType<typeof rows>>();
    const oldFields = deferred<ReturnType<typeof fields>>();
    mockApi.find.mockReturnValueOnce(oldRows.promise).mockResolvedValueOnce(rows('orders'));
    mockApi.sampleFields.mockReturnValueOnce(oldFields.promise).mockResolvedValueOnce(fields('orderId'));
    useStore.setState({
      queryHistory: [old],
      selectedDb: 'testdb',
      selectedCollection: 'previous',
      projection: { previous: 1 },
      docs: [{ label: 'previous' }],
      totalCount: 1,
    });
    const replay = useStore.getState().restoreFromHistory(old);
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'archive',
      selectedCollection: 'users',
      pendingFilterText: old.query,
      queryMode: 'filter',
      historyIndex: 0,
      docs: [],
      projection: null,
    });
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'archive.users' });
    await useStore.getState().selectCollection('testdb', 'orders');
    oldFields.resolve(fields('old user field'));
    oldRows.resolve(rows('old user rows'));
    await replay;
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'testdb',
      selectedCollection: 'orders',
      docs: [{ label: 'orders' }],
      fieldNames: ['orderId'],
      pendingFilterText: '{}',
      queryMode: 'filter',
      historyIndex: 0,
    });
    expect(mockApi.find.mock.calls.map(([db, collection]) => [db, collection])).toEqual([
      ['archive', 'users'],
      ['testdb', 'orders'],
    ]);
    expect(useStore.getState().queryHistory.map((entry) => entry.collection)).toEqual(['orders', 'users']);
  });

  it('keeps the latest history target, editor, QueryMode and cursor while old fields and rows arrive', async () => {
    const old = historyEntry('old');
    const latest = historyEntry('latest', { collection: 'orders', queryMode: 'aggregate', query: '[{ $match: {} }]' });
    const oldRows = deferred<ReturnType<typeof rows>>();
    const oldFields = deferred<ReturnType<typeof fields>>();
    const latestRows = deferred<Result<Record<string, unknown>[]>>();
    mockApi.find.mockReturnValueOnce(oldRows.promise);
    mockApi.aggregate.mockReturnValueOnce(latestRows.promise);
    mockApi.sampleFields.mockReturnValueOnce(oldFields.promise).mockResolvedValueOnce(fields('orderId'));
    useStore.setState({ queryHistory: [old, latest] });
    const oldReplay = useStore.getState().restoreFromHistory(old);
    const latestReplay = useStore.getState().restoreFromHistory(latest);
    expect(useStore.getState()).toMatchObject({
      selectedCollection: 'orders',
      pendingFilterText: latest.query,
      queryMode: 'aggregate',
      pendingQueryMode: 'aggregate',
      historyIndex: 1,
      loading: true,
    });
    oldRows.resolve(rows('old rows'));
    oldFields.resolve(fields('old fields'));
    await oldReplay;
    expect(useStore.getState()).toMatchObject({
      selectedCollection: 'orders',
      pendingFilterText: latest.query,
      queryMode: 'aggregate',
      historyIndex: 1,
      docs: [],
      loading: true,
      fieldNames: ['orderId'],
    });
    latestRows.resolve({ ok: true, data: [{ label: 'latest aggregate' }] });
    await latestReplay;
    expect(useStore.getState()).toMatchObject({
      docs: [{ label: 'latest aggregate' }],
      totalCount: 1,
      resultQueryMode: 'aggregate',
      historyIndex: 1,
    });
    expect(useStore.getState().queryHistory).toEqual([old, latest]);
    expect(mockApi.saveHistory).not.toHaveBeenCalled();
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'testdb.orders' });
  });

  it('advances consecutive history navigation immediately on the same collection without losing projection', async () => {
    const a = historyEntry('a');
    const b = historyEntry('b');
    const first = deferred<ReturnType<typeof rows>>();
    const second = deferred<ReturnType<typeof rows>>();
    mockApi.find.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [a, b],
      projection: { label: 1 },
    });
    const one = useStore.getState().navigateHistory(1);
    const two = useStore.getState().navigateHistory(1);
    expect(useStore.getState()).toMatchObject({
      historyIndex: 1,
      pendingFilterText: b.query,
      projection: { label: 1 },
    });
    second.resolve(rows('b'));
    await two;
    first.resolve(rows('a'));
    await one;
    expect(useStore.getState()).toMatchObject({
      docs: [{ label: 'b' }],
      historyIndex: 1,
      pendingFilterText: b.query,
      projection: { label: 1 },
    });
    expect(useStore.getState().queryHistory).toEqual([a, b]);
  });

  it.each(['before', 'after'] as const)(
    'rejects previous same-server incarnation replies with broadcast %s connect reply',
    async (order) => {
      let emit!: (state: ConnectionState) => void;
      mockApi.onConnectionState.mockImplementation((cb) => {
        emit = cb;
        return () => {};
      });
      useStore.setState({ status: connected });
      const unsubscribe = useStore.getState().subscribeToConnectionState();
      const oldRows = deferred<ReturnType<typeof rows>>();
      const oldFields = deferred<ReturnType<typeof fields>>();
      const disconnectReply = deferred<Result<undefined>>();
      const connectReply = deferred<Result<ConnectedSession>>();
      mockApi.find.mockReturnValueOnce(oldRows.promise).mockResolvedValueOnce(rows('new incarnation'));
      mockApi.sampleFields
        .mockReturnValueOnce(oldFields.promise)
        .mockResolvedValueOnce(fields('new incarnation field'));
      mockApi.disconnect.mockReturnValueOnce(disconnectReply.promise);
      mockApi.connect.mockReturnValueOnce(connectReply.promise);
      const oldSelection = useStore.getState().selectCollection('testdb', 'users');
      const reconnect = useStore.getState().connect('mongodb://localhost');
      expect(useStore.getState()).toMatchObject({ selectedCollection: null, docs: [], fieldNames: [] });
      disconnectReply.resolve({ ok: true, data: undefined });
      await Promise.resolve();
      emit({ status: 'connecting', uri: 'mongodb://localhost' });
      const widths = { '["testdb","users"]': { label: 240 } };
      if (order === 'before') emit(connected);
      connectReply.resolve({
        ok: true,
        data: makeSession({ collectionColumnWidths: widths, autoSelectedDb: 'testdb' }),
      });
      await reconnect;
      if (order === 'after') emit(connected);
      expect(useStore.getState().selectedDb).toBe('testdb');
      expect(useStore.getState().collectionColumnWidths).toEqual(widths);
      await useStore.getState().selectCollection('testdb', 'users');
      oldRows.resolve(rows('previous incarnation'));
      oldFields.resolve(fields('previous incarnation field'));
      await oldSelection;
      expect(useStore.getState()).toMatchObject({
        docs: [{ label: 'new incarnation' }],
        fieldNames: ['new incarnation field'],
      });
      expect(useStore.getState().collectionColumnWidths).toEqual(widths);
      unsubscribe();
    }
  );

  it.each<ConnectionState>([
    { status: 'disconnected' },
    { status: 'connecting', uri: 'mongodb://localhost' },
    { status: 'error', uri: 'mongodb://localhost', error: 'Lost connection' },
    { status: 'connected', uri: 'mongodb://elsewhere', connectionKey: 'elsewhere:27017' },
  ])('invalidates collection work on the ConnectionState transition to $status $uri', async (next) => {
    let emit!: (state: ConnectionState) => void;
    mockApi.onConnectionState.mockImplementation((cb) => {
      emit = cb;
      return () => {};
    });
    useStore.setState({ status: connected });
    const unsubscribe = useStore.getState().subscribeToConnectionState();
    const rowReply = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    const fieldReply = deferred<ReturnType<typeof fields>>();
    mockApi.find.mockReturnValueOnce(rowReply.promise);
    mockApi.sampleFields.mockReturnValueOnce(fieldReply.promise);
    const selection = useStore.getState().selectCollection('testdb', 'users');
    emit(next);
    rowReply.resolve({ ok: false, error: 'Old connection error' });
    fieldReply.resolve(fields('old field'));
    await selection;
    expect(useStore.getState()).toMatchObject({
      selectedCollection: null,
      docs: [],
      totalCount: 0,
      fieldNames: [],
      error: null,
      loading: false,
    });
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: null });
    unsubscribe();
  });

  it('invalidates collection work before waiting for disconnect transport', async () => {
    const rowReply = deferred<ReturnType<typeof rows>>();
    const fieldReply = deferred<ReturnType<typeof fields>>();
    const disconnectReply = deferred<Result<undefined>>();
    mockApi.find.mockReturnValueOnce(rowReply.promise);
    mockApi.sampleFields.mockReturnValueOnce(fieldReply.promise);
    mockApi.disconnect.mockReturnValueOnce(disconnectReply.promise);
    const selection = useStore.getState().selectCollection('testdb', 'users');
    const disconnect = useStore.getState().disconnect();
    rowReply.resolve(rows('disconnected rows'));
    fieldReply.resolve(fields('disconnected fields'));
    await selection;
    expect(useStore.getState()).toMatchObject({ selectedCollection: null, docs: [], totalCount: 0, fieldNames: [] });
    disconnectReply.resolve({ ok: true, data: undefined });
    await disconnect;
  });

  it('ignores a database listing that completes after a newer collection selection', async () => {
    const listing = deferred<Result<{ name: string; type: string }[]>>();
    mockApi.listCollections.mockReturnValueOnce(listing.promise);
    mockApi.find.mockResolvedValueOnce(rows('new collection'));
    mockApi.sampleFields.mockResolvedValueOnce(fields('new field'));
    const database = useStore.getState().selectDb('oldDb');
    await useStore.getState().selectCollection('newDb', 'users');
    listing.resolve({ ok: true, data: [{ name: 'old collection', type: 'collection' }] });
    await database;
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'newDb',
      selectedCollection: 'users',
      docs: [{ label: 'new collection' }],
      collections: [],
      fieldNames: ['new field'],
    });
  });
});
