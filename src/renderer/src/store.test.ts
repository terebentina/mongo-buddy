import { filterResults, aggregateResults, type FilterAppliedQuery } from './test-fixtures';
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
  emptyCollection: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  sampleFields: vi.fn(),
  saveHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  saveCollectionSort: vi.fn(),
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
    collectionSorts: {},
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

beforeEach(async () => {
  (window as unknown as Record<string, unknown>).api = mockApi;
  mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
  await useStore.getState().disconnect();
  vi.resetAllMocks();
  mockApi.onConnectionState.mockImplementation(() => () => {});
  mockApi.onMcpStatusUpdate.mockImplementation(() => () => {});
  mockApi.getMcpStatus.mockResolvedValue({ running: false, port: null });
  mockApi.saveHistory.mockResolvedValue(undefined);
  mockApi.saveCollectionSort.mockResolvedValue({ ok: true, data: undefined });
  useStore.setState({
    status: { status: 'disconnected' } as ConnectionState,
    uri: '',
    databases: [],
    ghostDatabases: [],
    collections: [],
    expandedDb: null,
    selectedDb: null,
    selectedCollection: null,
    limit: 20,
    projection: null,
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
    fieldNames: [],
    pendingFilterText: null,
    queryHistory: [],
    collectionColumnWidths: {},
    collectionSorts: {},
    historyIndex: null,
    pendingQueryMode: null,
    mcpStatus: { running: false, port: null },
    acceptedResults: null,
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
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, db: 'testdb', collection: 'users' },
        [{ _id: '1' }],
        undefined
      ),
    });

    await useStore.getState().toggleDb('testdb');

    const state = useStore.getState();
    expect(state.expandedDb).toBeNull();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
    expect(state.acceptedResults?.docs ?? []).toEqual([{ _id: '1' }]);
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
    expect(state.acceptedResults?.docs ?? []).toEqual([{ _id: '1', name: 'Alice' }]);
    expect(state.acceptedResults?.totalCount ?? 0).toBe(1);
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(0);
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
    useStore.setState({
      pendingFilterText: '{"status":"active"}',
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, filter: { status: 'active' } },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });

    await useStore.getState().selectCollection('testdb', 'orders');

    const state = useStore.getState();
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.filter).toEqual({});
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
    expect(state.acceptedResults?.docs ?? []).toEqual([]);
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
    expect(state.acceptedResults?.docs ?? []).toEqual([{ _id: '1', name: 'Alice' }]);
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.filter).toEqual({ name: 'Alice' });
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(0);
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
    expect(state.acceptedResults?.docs ?? []).toEqual([{ _id: null, total: 42 }]);
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
      acceptedResults: filterResults(),
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: '1', name: 'Alice' }]);
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
      acceptedResults: filterResults(),
    });
    mockApi.updateOne.mockResolvedValue({ ok: true, data: { _id: '1', name: 'Bob' } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Bob' }], totalCount: 1 },
    });

    const error = await useStore.getState().updateDoc('1', { name: 'Bob' });

    expect(error).toBeNull();
    expect(mockApi.updateOne).toHaveBeenCalledWith('testdb', 'users', '1', { name: 'Bob' });
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: '1', name: 'Bob' }]);
  });

  it('updateManyDocs() refreshes docs and returns matched/modified counts', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { status: 'active' },
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.updateMany.mockResolvedValue({ ok: true, data: { matchedCount: 3, modifiedCount: 2 } });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', status: 'active', archived: true }], totalCount: 3 },
    });

    const result = await useStore.getState().updateManyDocs({ $set: { archived: true } }, {});

    expect(result).toEqual({ ok: true, data: { matchedCount: 3, modifiedCount: 2 } });
    expect(mockApi.find).toHaveBeenCalled();
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: '1', status: 'active', archived: true }]);
  });

  it('updateManyDocs() does not refresh when the update fails, returns the error Result', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, db: 'testdb', collection: 'users', filter: {} },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
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
      limit: 20,
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: filter,
          sort: { name: 1 },
          skip: 20,
          limit: 20,
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
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
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(0);
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: '21' }]);
  });

  it('does not refresh results when the delete results action fails', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { status: 'inactive' },
          skip: 20,
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.deleteMany.mockResolvedValue({ ok: false, error: 'Delete failed' });

    const result = await useStore.getState().deleteResults();

    expect(result).toEqual({ ok: false, error: 'Delete failed' });
    expect(mockApi.find).not.toHaveBeenCalled();
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(20);
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
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, db: 'testdb', collection: 'users' },
        [{ _id: '1', name: 'Alice' }],
        1
      ),
    });
    mockApi.deleteOne.mockResolvedValue({ ok: true, data: undefined });
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [], totalCount: 0 },
    });

    const error = await useStore.getState().deleteDoc('1');

    expect(error).toBeNull();
    expect(mockApi.deleteOne).toHaveBeenCalledWith('testdb', 'users', '1');
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([]);
    expect(useStore.getState().acceptedResults?.totalCount ?? 0).toBe(0);
  });
});

describe('projection', () => {
  const activeProjection = { name: 1, score: { $meta: 'textScore' } };

  beforeEach(() => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      projection: null,
      limit: 20,
      queryMode: 'filter',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { active: true },
          projection: null,
          sort: { name: 1 },
          skip: 20,
          limit: 20,
        },
        [{ _id: 'old', name: 'Old' }],
        1
      ),
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ name: 'Alice' }]);
    expect(useStore.getState().acceptedResults?.totalCount ?? 0).toBe(41);
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'old', name: 'Old' }]);
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'page' }]);
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(40);
  });

  it('discards a late Clear response after a newer page request', async () => {
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'page' }]);
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(40);
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
    await vi.waitFor(() => expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'sorted' }]));
    applyResponse.resolve({ ok: true, data: { docs: [{ name: 'stale Apply' }], totalCount: 1 } });
    await applyPromise;

    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'sorted' }]);
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.sort).toEqual({
      age: 1,
    });
  });

  it('discards a late Clear response after a newer sort request', async () => {
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    await vi.waitFor(() => expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'sorted' }]));
    clearResponse.resolve({ ok: true, data: { docs: [{ _id: 'stale Clear' }], totalCount: 1 } });
    await clearPromise;

    expect(useStore.getState().projection).toEqual(activeProjection);
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'sorted' }]);
    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.sort).toEqual({
      age: 1,
    });
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'order' }]);
  });

  it('discards a late Clear response after a newer collection request', async () => {
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    expect(useStore.getState().acceptedResults?.docs ?? []).toEqual([{ _id: 'order' }]);
  });

  it('updates the result QueryMode only after a successful request replaces the rows', async () => {
    useStore.setState({
      queryMode: 'aggregate',
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.aggregate.mockResolvedValueOnce({ ok: false, error: 'Aggregate failed' });

    await useStore.getState().runQuery('[{ $match: {} }]');

    expect(useStore.getState().acceptedResults?.appliedQuery.queryMode).toBe('filter');

    mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ _id: 'aggregate' }] });
    await useStore.getState().runQuery('[{ $match: {} }]');

    expect(useStore.getState().acceptedResults?.appliedQuery.queryMode).toBe('aggregate');
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
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().fetchPage(40);
    await useStore.getState().setSort('age');
    await useStore.getState().setLimit(50);
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

    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
    await useStore.getState().selectCollection('otherdb', 'orders');
    expect(useStore.getState().projection).toBeNull();

    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    useStore.setState({
      projection: activeProjection,
      acceptedResults: filterResults(
        { ...useStore.getState().acceptedResults?.appliedQuery, projection: activeProjection },
        useStore.getState().acceptedResults?.docs
      ),
    });
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
    expect(state.acceptedResults?.docs ?? []).toEqual([{ name: 'Alice' }]);
    expect(state.acceptedResults?.totalCount ?? 0).toBe(1);
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
    expect(state.acceptedResults?.docs ?? []).toEqual([{ _id: 1 }]);
    expect(state.acceptedResults?.totalCount ?? 0).toBe(1);
  });

  it('filter entry syncs filter state to parsed query', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { old: 'stale' },
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(makeEntry({ query: '{"name":"Alice"}' }));

    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.filter).toEqual({
      name: 'Alice',
    });
  });

  it('aggregate history accepts a pipeline context without a filter', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { old: 'stale' },
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [] });

    await useStore.getState().restoreFromHistory(makeEntry({ queryMode: 'aggregate', query: '[{"$match":{}}]' }));

    expect(useStore.getState().acceptedResults?.appliedQuery).toEqual({
      db: 'testdb',
      collection: 'users',
      queryMode: 'aggregate',
      pipeline: [{ $match: {} }],
    });
  });

  it('the filter value action uses a restored empty filter', async () => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: { status: 'active' },
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(makeEntry({ query: '{}' }));
    useStore.getState().applyFilterValue('name', 'Bob', 'include');
    await vi.waitFor(() => expect(useStore.getState().loading).toBe(false));

    expect((useStore.getState().acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.filter).toEqual({
      name: 'Bob',
    });
  });
});

describe('filter value action', () => {
  it.each([
    ['include' as const, 'active'],
    ['exclude' as const, { $ne: 'active' }],
  ])('applies the %s action and runs the new query', async (action, condition) => {
    useStore.setState({
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryHistory: [],
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'users',
          filter: {},
          skip: 40,
        },
        useStore.getState().acceptedResults?.docs ?? [],
        useStore.getState().acceptedResults?.totalCount ?? 0
      ),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    useStore.getState().applyFilterValue('status', 'active', action);
    await vi.waitFor(() => expect(useStore.getState().loading).toBe(false));

    const filter = { status: condition };
    const query = JSON.stringify(filter, null, 2);
    const state = useStore.getState();
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.filter).toEqual(filter);
    expect((state.acceptedResults?.appliedQuery as FilterAppliedQuery | undefined)?.skip).toBe(0);
    expect(state.pendingFilterText).toBe(query);
    expect(state.pendingQueryMode).toBe('filter');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter,
      skip: 0,
      limit: 20,
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
      queryHistory: [attempt, persisted],
      historyIndex: 0,
      acceptedResults: { docs: [{ label: 'newly selected users' }], totalCount: 1 },
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
      projection: null,
      queryMode: 'aggregate',
      pendingFilterText: entry.query,
      historyIndex: 0,
      acceptedResults: {
        docs: [{ name: 'Active user', active: true }],
        totalCount: 1,
        appliedQuery: { queryMode: 'aggregate' },
      },
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
      projection: { name: 1 },
      fieldNames: ['old'],
      error: 'old error',
      acceptedResults: aggregateResults({ ...useStore.getState().acceptedResults?.appliedQuery }, [{ label: 'old' }]),
    });
    mockApi.find.mockReturnValueOnce(reply.promise);
    mockApi.sampleFields.mockReturnValueOnce(fieldReply.promise);
    const selection = useStore.getState().selectCollection('testdb', 'orders');

    expect(useStore.getState()).toMatchObject({
      selectedDb: 'testdb',
      selectedCollection: 'orders',
      projection: null,
      fieldNames: [],
      error: null,
      queryMode: 'filter',
      pendingFilterText: '{}',
      pendingQueryMode: 'filter',
      historyIndex: 0,
      acceptedResults: null,
    });
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'testdb.orders' });
    reply.resolve({ ok: false, error: 'Initial load failed' });
    await Promise.resolve();
    expect(useStore.getState()).toMatchObject({
      loading: false,
      error: 'Initial load failed',
      acceptedResults: null,
    });
    fieldReply.resolve(fields('orderId'));
    await selection;
    expect(useStore.getState()).toMatchObject({
      selectedCollection: 'orders',
      error: 'Initial load failed',
      fieldNames: ['orderId'],
      acceptedResults: null,
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
      fieldNames: ['latest user field'],
      loading: false,
      historyIndex: 0,
      acceptedResults: { docs: [{ label: 'latest users' }], totalCount: 1 },
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
      else {
        initialReply.resolve(rows('initial rows'));
        await vi.waitFor(() => expect(useStore.getState().loading).toBe(false));
        await useStore.getState().fetchPage(20);
      }
      expect(useStore.getState()).toMatchObject({
        fieldNames: [],
        loading: false,
        acceptedResults: { docs: [{ label: 'newer rows' }] },
      });
      initialReply.resolve(rows('superseded initial rows'));
      fieldReply.resolve(fields('valid user field'));
      await selection;
      expect(useStore.getState()).toMatchObject({
        fieldNames: ['valid user field'],
        acceptedResults: { docs: [{ label: 'newer rows' }], appliedQuery: { skip: action === 'page' ? 20 : 0 } },
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
      acceptedResults: filterResults(
        {
          ...useStore.getState().acceptedResults?.appliedQuery,
          db: 'testdb',
          collection: 'previous',
          projection: { previous: 1 },
        },
        [{ label: 'previous' }],
        1
      ),
    });
    const replay = useStore.getState().restoreFromHistory(old);
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'archive',
      selectedCollection: 'users',
      pendingFilterText: old.query,
      queryMode: 'filter',
      historyIndex: 0,
      projection: null,
      acceptedResults: null,
    });
    expect(mockApi.setWindowTitle).toHaveBeenLastCalledWith({ location: 'archive.users' });
    await useStore.getState().selectCollection('testdb', 'orders');
    oldFields.resolve(fields('old user field'));
    oldRows.resolve(rows('old user rows'));
    await replay;
    expect(useStore.getState()).toMatchObject({
      selectedDb: 'testdb',
      selectedCollection: 'orders',
      fieldNames: ['orderId'],
      pendingFilterText: '{}',
      queryMode: 'filter',
      historyIndex: 0,
      acceptedResults: { docs: [{ label: 'orders' }] },
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
      loading: true,
      fieldNames: ['orderId'],
      acceptedResults: null,
    });
    latestRows.resolve({ ok: true, data: [{ label: 'latest aggregate' }] });
    await latestReplay;
    expect(useStore.getState()).toMatchObject({
      historyIndex: 1,
      acceptedResults: {
        docs: [{ label: 'latest aggregate' }],
        totalCount: 1,
        appliedQuery: { queryMode: 'aggregate' },
      },
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
      historyIndex: 1,
      pendingFilterText: b.query,
      projection: { label: 1 },
      acceptedResults: { docs: [{ label: 'b' }] },
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
      expect(useStore.getState()).toMatchObject({
        selectedCollection: null,
        fieldNames: [],
        acceptedResults: null,
      });
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
        fieldNames: ['new incarnation field'],
        acceptedResults: { docs: [{ label: 'new incarnation' }] },
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
      fieldNames: [],
      error: null,
      loading: false,
      acceptedResults: null,
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
    expect(useStore.getState()).toMatchObject({
      selectedCollection: null,
      fieldNames: [],
      acceptedResults: null,
    });
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
      collections: [],
      fieldNames: ['new field'],
      acceptedResults: { docs: [{ label: 'new collection' }] },
    });
  });
});

describe('accepted query results', () => {
  beforeEach(async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', projection: { name: 1 } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'accepted', name: 'Alice' }], totalCount: 61 } });
    await useStore.getState().runQuery('{ active: true }');
    await useStore.getState().setSort('name');
    await useStore.getState().fetchPage(20);
    mockApi.find.mockClear();
  });

  it.each(['server rejection', 'invalid JSON', 'invalid filter shape'] as const)(
    'retains the complete accepted context after %s and uses it for paging and bulk writes',
    async (failure) => {
      const accepted = useStore.getState().acceptedResults;
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Rejected condition' });
      const text = failure === 'invalid JSON' ? '{ bad:' : failure === 'invalid filter shape' ? '[]' : '{ bad: true }';
      expect(await useStore.getState().runQuery(text)).toBeTruthy();
      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState().error).toBeTruthy();
      expect(useStore.getState().loading).toBe(false);
      mockApi.find
        .mockReset()
        .mockResolvedValue({ ok: true, data: { docs: [{ _id: 'next', name: 'Bob' }], totalCount: 61 } });
      await useStore.getState().fetchPage(40);
      expect(useStore.getState().acceptedResults).toEqual(
        filterResults(
          { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 40 },
          [{ _id: 'next', name: 'Bob' }],
          61
        )
      );
      mockApi.updateMany.mockResolvedValue({ ok: true, data: { matchedCount: 61, modifiedCount: 61 } });
      await useStore.getState().updateManyDocs({ $set: { checked: true } }, {});
      expect(mockApi.updateMany).toHaveBeenCalledWith(
        'testdb',
        'users',
        { active: true },
        { $set: { checked: true } },
        {}
      );
      mockApi.deleteMany.mockResolvedValue({ ok: true, data: 61 });
      await useStore.getState().deleteResults();
      expect(mockApi.deleteMany).toHaveBeenCalledWith('testdb', 'users', { active: true });
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ skip: 0, filter: { active: true } });
    }
  );

  it.each(['page', 'sort', 'page size', 'projection Apply', 'projection Clear', 'refresh'] as const)(
    'retains rows and all metadata when a %s change is rejected',
    async (action) => {
      const accepted = useStore.getState().acceptedResults;
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Read rejected' });
      if (action === 'page') await useStore.getState().fetchPage(40);
      if (action === 'sort') await useStore.getState().setSort('age');
      if (action === 'page size') await useStore.getState().setLimit(50);
      if (action === 'projection Apply') await useStore.getState().applyProjection('{ age: 1 }');
      if (action === 'projection Clear') await useStore.getState().clearProjection();
      if (action === 'refresh') await useStore.getState().refreshDocs();
      expect(useStore.getState()).toMatchObject({
        acceptedResults: accepted,
        projection: { name: 1 },
        limit: 20,
        loading: false,
        error: 'Read rejected',
      });
      expect(useStore.getState().acceptedResults).toBe(accepted);
    }
  );

  it.each(['success', 'failure'] as const)(
    'ignores superseded %s without clearing newer busy state or error',
    async (oldOutcome) => {
      const accepted = useStore.getState().acceptedResults;
      const old = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      const current = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      mockApi.find.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const oldRun = useStore.getState().runQuery('{ old: true }');
      const currentRun = useStore.getState().runQuery('{ newest: true }');
      old.resolve(
        oldOutcome === 'success'
          ? { ok: true, data: { docs: [{ name: 'stale' }], totalCount: 1 } }
          : { ok: false, error: 'Stale rejection' }
      );
      await oldRun;
      expect(useStore.getState()).toMatchObject({ acceptedResults: accepted, loading: true, error: null });
      current.resolve({ ok: false, error: 'Current rejection' });
      await currentRun;
      expect(useStore.getState()).toMatchObject({
        acceptedResults: accepted,
        loading: false,
        error: 'Current rejection',
      });
    }
  );

  it('explicit projection Apply uses submitted conditions while paging keeps accepted conditions', async () => {
    const accepted = useStore.getState().acceptedResults;
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Candidate rejected' });
    await useStore.getState().runQuery('{ attempted: true }');
    expect(useStore.getState().acceptedResults).toBe(accepted);
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ age: 27 }], totalCount: 3 } });
    await useStore.getState().applyProjection('{ age: 1 }');
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { attempted: true }, projection: { age: 1 }, sort: { name: 1 }, skip: 20 },
        [{ age: 27 }],
        3
      )
    );
  });

  it('rapid filter value actions preserve submitted conflicts through rejection and late replies', async () => {
    const accepted = useStore.getState().acceptedResults;
    const replies = Array.from({ length: 3 }, () =>
      deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>()
    );
    for (const reply of replies) mockApi.find.mockReturnValueOnce(reply.promise);
    useStore.getState().applyFilterValue('status', 'active', 'include');
    useStore.getState().applyFilterValue('status', 'active', 'exclude');
    useStore.getState().applyFilterValue('tier', 2, 'include');
    const filter = { active: true, status: { $in: ['active'], $ne: 'active' }, tier: 2 };
    expect(JSON.parse(useStore.getState().pendingFilterText!)).toEqual(filter);
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(
      useStore
        .getState()
        .queryHistory.slice(0, 3)
        .map((entry) => JSON.parse(entry.query))
    ).toEqual([
      filter,
      { active: true, status: { $in: ['active'], $ne: 'active' } },
      { active: true, status: 'active' },
    ]);
    replies[2].resolve({ ok: false, error: 'Conflicting conditions rejected' });
    await vi.waitFor(() => expect(useStore.getState().loading).toBe(false));
    replies[0].resolve({ ok: true, data: { docs: [{ name: 'stale' }], totalCount: 1 } });
    replies[1].resolve({ ok: false, error: 'Stale failure' });
    await Promise.all(replies.map((reply) => reply.promise));
    expect(useStore.getState()).toMatchObject({ acceptedResults: accepted, error: 'Conflicting conditions rejected' });
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [], totalCount: 0 } });
    useStore.getState().applyFilterValue('tier', 3, 'include');
    await vi.waitFor(() => expect(useStore.getState().loading).toBe(false));
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({
      filter: { ...filter, tier: { $in: [2, 3] } },
    });
  });

  it('clearing a paused preference leaves retained filter projection metadata intact', async () => {
    const accepted = useStore.getState().acceptedResults;
    useStore.getState().setQueryMode('aggregate');
    mockApi.aggregate.mockResolvedValue({ ok: false, error: 'Pipeline rejected' });
    await useStore.getState().runQuery('[]');
    await useStore.getState().clearProjection();
    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().acceptedResults).toBe(accepted);
    await useStore.getState().fetchPage(40);
    expect(mockApi.find).toHaveBeenLastCalledWith('testdb', 'users', {
      filter: { active: true },
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 40,
      limit: 20,
    });
  });

  it('requires accepted filter results for writes after a failed first query or an accepted aggregate', async () => {
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'First query failed' });
    await useStore.getState().selectCollection('testdb', 'orders');
    expect(useStore.getState().acceptedResults).toBeNull();
    expect((await useStore.getState().deleteResults()).ok).toBe(false);
    expect((await useStore.getState().updateManyDocs({ $set: { value: 1 } }, {})).ok).toBe(false);
    useStore.getState().setQueryMode('aggregate');
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [{ total: 42 }] });
    await useStore.getState().runQuery('[]');
    useStore.getState().setQueryMode('filter');
    await useStore.getState().fetchPage(20);
    await useStore.getState().setSort('total');
    await useStore.getState().setLimit(10);
    expect((await useStore.getState().deleteResults()).ok).toBe(false);
    expect((await useStore.getState().updateManyDocs({ $set: { value: 1 } }, {})).ok).toBe(false);
    expect(mockApi.deleteMany).not.toHaveBeenCalled();
    expect(mockApi.updateMany).not.toHaveBeenCalled();
    expect(mockApi.find).toHaveBeenCalledTimes(1);
    expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ collection: 'orders' }, [{ total: 42 }]));
  });

  it('retains the accepted page if deletion succeeds but the following page-one read fails', async () => {
    const accepted = useStore.getState().acceptedResults;
    mockApi.deleteMany.mockResolvedValueOnce({ ok: true, data: 61 });
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Refresh failed' });
    expect(await useStore.getState().deleteResults()).toEqual({ ok: true, data: 61 });
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(useStore.getState().error).toBe('Refresh failed');
  });

  it('does not let a late write refresh supersede a newer query still waiting for its reply', async () => {
    const write = deferred<Result<number>>();
    const read = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    mockApi.deleteMany.mockReturnValueOnce(write.promise);
    mockApi.find.mockReturnValueOnce(read.promise);
    const deleting = useStore.getState().deleteResults();
    const running = useStore.getState().runQuery('{ latest: true }');
    write.resolve({ ok: true, data: 61 });
    await deleting;
    expect(useStore.getState().loading).toBe(true);
    expect(mockApi.find).toHaveBeenCalledTimes(1);
    read.resolve({ ok: true, data: { docs: [{ name: 'latest rows' }], totalCount: 1 } });
    await running;
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ filter: { latest: true } });
    expect(useStore.getState().acceptedResults?.docs).toEqual([{ name: 'latest rows' }]);
  });

  it('late mutation completion leaves a newer result snapshot and its page untouched', async () => {
    const write = deferred<Result<number>>();
    mockApi.deleteMany.mockReturnValueOnce(write.promise);
    const deleting = useStore.getState().deleteResults();
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'new query' }], totalCount: 1 } });
    await useStore.getState().runQuery('{ new: true }');
    const newer = useStore.getState().acceptedResults;
    write.resolve({ ok: true, data: 61 });
    await deleting;
    expect(useStore.getState().acceptedResults).toBe(newer);
    expect(mockApi.find).toHaveBeenCalledTimes(1);
  });
});

describe('mutation refresh ownership', () => {
  type ReadResult = Result<{ docs: Record<string, unknown>[]; totalCount: number }>;
  const mutations = [
    {
      name: 'insert document',
      api: mockApi.insertOne,
      run: () => useStore.getState().insertDoc({ name: 'Bob' }),
      reply: { ok: true, data: { _id: 'new', name: 'Bob' } },
      outcome: null,
      args: ['testdb', 'users', { name: 'Bob' }],
      skip: 20,
    },
    {
      name: 'update document',
      api: mockApi.updateOne,
      run: () => useStore.getState().updateDoc({ $oid: '123' }, { name: 'Bob' }),
      reply: { ok: true, data: { _id: { $oid: '123' }, name: 'Bob' } },
      outcome: null,
      args: ['testdb', 'users', { $oid: '123' }, { name: 'Bob' }],
      skip: 20,
    },
    {
      name: 'delete document',
      api: mockApi.deleteOne,
      run: () => useStore.getState().deleteDoc({ $oid: '123' }),
      reply: { ok: true, data: undefined },
      outcome: null,
      args: ['testdb', 'users', { $oid: '123' }],
      skip: 20,
    },
    {
      name: 'update results',
      api: mockApi.updateMany,
      run: () => useStore.getState().updateManyDocs({ $set: { checked: true } }, {}),
      reply: { ok: true, data: { matchedCount: 61, modifiedCount: 3 } },
      outcome: { ok: true, data: { matchedCount: 61, modifiedCount: 3 } },
      args: ['testdb', 'users', { active: true }, { $set: { checked: true } }, {}],
      skip: 20,
    },
    {
      name: 'delete results',
      api: mockApi.deleteMany,
      run: () => useStore.getState().deleteResults(),
      reply: { ok: true, data: 3 },
      outcome: { ok: true, data: 3 },
      args: ['testdb', 'users', { active: true }],
      skip: 0,
    },
    {
      name: 'empty collection',
      api: mockApi.emptyCollection,
      run: () => useStore.getState().emptyCollection('testdb', 'users'),
      reply: { ok: true, data: 61 },
      outcome: { ok: true, data: 61 },
      args: ['testdb', 'users'],
      skip: 20,
    },
  ];

  beforeEach(async () => {
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost:27017' },
      selectedDb: 'testdb',
      selectedCollection: 'users',
      projection: { name: 1 },
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 61 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['name'] });
    await useStore.getState().runQuery('{ active: true }');
    await useStore.getState().setSort('name');
    await useStore.getState().fetchPage(20);
    mockApi.find.mockClear();
    for (const mutation of mutations) mutation.api.mockResolvedValue(mutation.reply);
  });

  it('overlapping document writes each refresh their changes even after the first refresh commits', async () => {
    const firstWrite = deferred<Result<Record<string, unknown>>>();
    const secondWrite = deferred<Result<Record<string, unknown>>>();
    mockApi.insertOne.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    mockApi.find
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Bob' }], totalCount: 62 } })
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Bob' }, { name: 'Carol' }], totalCount: 63 } });
    const first = useStore.getState().insertDoc({ name: 'Bob' });
    const second = useStore.getState().insertDoc({ name: 'Carol' });

    firstWrite.resolve({ ok: true, data: { _id: 'bob', name: 'Bob' } });
    expect(await first).toBeNull();
    expect(useStore.getState().acceptedResults?.docs).toEqual([{ name: 'Bob' }]);

    secondWrite.resolve({ ok: true, data: { _id: 'carol', name: 'Carol' } });
    expect(await second).toBeNull();

    expect(mockApi.find).toHaveBeenCalledTimes(2);
    expect(mockApi.find).toHaveBeenLastCalledWith('testdb', 'users', {
      filter: { active: true },
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
        [{ name: 'Bob' }, { name: 'Carol' }],
        63
      )
    );
    expect(useStore.getState()).toMatchObject({ loading: false, error: null });
  });

  it.each(['success', 'failure'] as const)(
    'a second successful write refreshes while the first read is pending and ignores its stale %s',
    async (outcome) => {
      const accepted = useStore.getState().acceptedResults;
      const firstWrite = deferred<Result<Record<string, unknown>>>();
      const secondWrite = deferred<Result<Record<string, unknown>>>();
      const firstRead = deferred<ReadResult>();
      const secondRead = deferred<ReadResult>();
      const firstRequested = deferred<void>();
      const secondRequested = deferred<void>();
      mockApi.insertOne.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
      mockApi.find
        .mockImplementationOnce(() => {
          firstRequested.resolve();
          return firstRead.promise;
        })
        .mockImplementationOnce(() => {
          secondRequested.resolve();
          return secondRead.promise;
        });
      const first = useStore.getState().insertDoc({ name: 'Bob' });
      const second = useStore.getState().insertDoc({ name: 'Carol' });
      firstWrite.resolve({ ok: true, data: { _id: 'bob', name: 'Bob' } });
      await firstRequested.promise;

      secondWrite.resolve({ ok: true, data: { _id: 'carol', name: 'Carol' } });
      await secondRequested.promise;
      expect(mockApi.find).toHaveBeenCalledTimes(2);
      firstRead.resolve(
        outcome === 'success'
          ? { ok: true, data: { docs: [{ name: 'Bob' }], totalCount: 62 } }
          : { ok: false, error: 'First refresh unavailable' }
      );
      expect(await first).toBeNull();
      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState()).toMatchObject({ loading: true, error: null });

      secondRead.resolve({ ok: true, data: { docs: [{ name: 'Bob' }, { name: 'Carol' }], totalCount: 63 } });
      expect(await second).toBeNull();
      expect(useStore.getState().acceptedResults).toEqual(
        filterResults(
          { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
          [{ name: 'Bob' }, { name: 'Carol' }],
          63
        )
      );
      expect(useStore.getState()).toMatchObject({ loading: false, error: null });
    }
  );

  it('a document write begun during an automatic refresh remains refreshable after that read commits', async () => {
    const read = deferred<ReadResult>();
    const write = deferred<Result<Record<string, unknown>>>();
    mockApi.find
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Carol' }], totalCount: 62 } });
    const refreshing = useStore.getState().refreshDocs();
    expect(useStore.getState().loading).toBe(true);
    mockApi.insertOne.mockReturnValueOnce(write.promise);
    const inserting = useStore.getState().insertDoc({ name: 'Carol' });

    read.resolve({ ok: true, data: { docs: [{ name: 'Alice refreshed' }], totalCount: 61 } });
    await refreshing;
    expect(useStore.getState().acceptedResults?.docs).toEqual([{ name: 'Alice refreshed' }]);
    write.resolve({ ok: true, data: { _id: 'carol', name: 'Carol' } });
    expect(await inserting).toBeNull();

    expect(mockApi.find).toHaveBeenCalledTimes(2);
    expect(mockApi.find).toHaveBeenLastCalledWith('testdb', 'users', {
      filter: { active: true },
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
        [{ name: 'Carol' }],
        62
      )
    );
    expect(useStore.getState()).toMatchObject({ loading: false, error: null });
  });

  it.each(['success', 'server rejection', 'invalid Run'] as const)(
    'a document write begun during an explicit newer read cannot revive old rows after %s',
    async (outcome) => {
      const accepted = useStore.getState().acceptedResults;
      const read = deferred<ReadResult>();
      const write = deferred<Result<Record<string, unknown>>>();
      mockApi.find.mockReturnValueOnce(read.promise);
      const running = useStore.getState().runQuery('{ newest: true }');
      expect(useStore.getState().loading).toBe(true);
      mockApi.insertOne.mockReturnValueOnce(write.promise);
      const inserting = useStore.getState().insertDoc({ name: 'Bob' });
      let error: string | null = null;

      if (outcome === 'invalid Run') {
        error = await useStore.getState().runQuery('{ bad:');
        expect(error).toBeTruthy();
      }
      read.resolve(
        outcome === 'server rejection'
          ? { ok: false, error: 'New condition rejected' }
          : { ok: true, data: { docs: [{ name: 'Newest' }], totalCount: 1 } }
      );
      const runError = await running;
      if (outcome === 'server rejection') {
        expect(runError).toBe('New condition rejected');
        error = 'New condition rejected';
      } else {
        expect(runError).toBeNull();
      }
      write.resolve({ ok: true, data: { _id: 'bob', name: 'Bob' } });
      expect(await inserting).toBeNull();

      expect(mockApi.find).toHaveBeenCalledTimes(1);
      if (outcome === 'success') {
        expect(useStore.getState().acceptedResults).toMatchObject({
          appliedQuery: { filter: { newest: true }, projection: { name: 1 }, skip: 0 },
          docs: [{ name: 'Newest' }],
          totalCount: 1,
        });
      } else {
        expect(useStore.getState().acceptedResults).toBe(accepted);
      }
      expect(useStore.getState()).toMatchObject({ loading: false, error });
    }
  );

  it.each(mutations)(
    '$name refreshes accepted conditions and page, not rejected input or changed preferences',
    async (mutation) => {
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Candidate rejected' });
      await useStore.getState().runQuery('{ rejected: true }');
      useStore.getState().setQueryMode('aggregate');
      await useStore.getState().clearProjection();
      useStore.setState({ limit: 50 });
      useStore.getState().setQueryMode('filter');
      mockApi.find.mockClear();
      mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Bob' }], totalCount: 58 } });

      expect(await mutation.run()).toEqual(mutation.outcome);

      expect(mutation.api).toHaveBeenCalledWith(...mutation.args);
      expect(mockApi.find).toHaveBeenCalledTimes(1);
      expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
        filter: { active: true },
        projection: { name: 1 },
        sort: { name: 1 },
        skip: mutation.skip,
        limit: 20,
      });
      expect(useStore.getState().acceptedResults).toEqual(
        filterResults(
          { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: mutation.skip },
          [{ name: 'Bob' }],
          58
        )
      );
      expect(useStore.getState()).toMatchObject({ limit: 50, projection: null, loading: false, error: null });
    }
  );

  it('clearing the paused projection preference does not suppress a pending document write refresh', async () => {
    const accepted = useStore.getState().acceptedResults;
    const write = deferred<Result<Record<string, unknown>>>();
    mockApi.insertOne.mockReturnValueOnce(write.promise);
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Bob' }], totalCount: 62 } });
    const inserting = useStore.getState().insertDoc({ name: 'Bob' });

    useStore.getState().setQueryMode('aggregate');
    expect(await useStore.getState().clearProjection()).toBeNull();
    expect(useStore.getState().projection).toBeNull();
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(mockApi.find).not.toHaveBeenCalled();

    write.resolve({ ok: true, data: { _id: 'bob', name: 'Bob' } });
    expect(await inserting).toBeNull();

    expect(mockApi.find).toHaveBeenCalledTimes(1);
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { active: true },
      projection: { name: 1 },
      sort: { name: 1 },
      skip: 20,
      limit: 20,
    });
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
        [{ name: 'Bob' }],
        62
      )
    );
    expect(useStore.getState()).toMatchObject({
      queryMode: 'aggregate',
      projection: null,
      loading: false,
      error: null,
    });
    expect(mockApi.aggregate).not.toHaveBeenCalled();
  });

  it('automatic refresh keeps the accepted filter even when the editor has switched to Aggregate', async () => {
    useStore.getState().setQueryMode('aggregate');
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Updated' }], totalCount: 61 } });

    await useStore.getState().refreshDocs();

    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 20 },
        [{ name: 'Updated' }],
        61
      )
    );
    expect(mockApi.aggregate).not.toHaveBeenCalled();
    expect(useStore.getState().queryMode).toBe('aggregate');
  });

  it.each(mutations)(
    '$name stays successful if the follow-up read fails without relabeling retained rows',
    async (mutation) => {
      const accepted = useStore.getState().acceptedResults;
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Refresh unavailable' });

      expect(await mutation.run()).toEqual(mutation.outcome);

      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState()).toMatchObject({
        loading: false,
        error: 'Refresh unavailable',
        acceptedResults: {
          docs: [{ name: 'Alice' }],
          totalCount: 61,
          appliedQuery: { skip: 20, limit: 20, projection: { name: 1 }, sort: { name: 1 } },
        },
      });
    }
  );

  it('deletion proposes page one without changing the displayed page until the read succeeds', async () => {
    const accepted = useStore.getState().acceptedResults;
    const read = deferred<ReadResult>();
    const requested = deferred<void>();
    mockApi.find.mockImplementationOnce(() => {
      requested.resolve();
      return read.promise;
    });

    const deleting = useStore.getState().deleteResults();
    await requested.promise;

    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(useStore.getState().loading).toBe(true);
    read.resolve({ ok: true, data: { docs: [{ name: 'Remaining' }], totalCount: 58 } });
    expect(await deleting).toEqual({ ok: true, data: 3 });
    expect(useStore.getState().acceptedResults).toEqual(
      filterResults(
        { filter: { active: true }, projection: { name: 1 }, sort: { name: 1 }, skip: 0 },
        [{ name: 'Remaining' }],
        58
      )
    );
  });

  it.each(mutations)('$name cannot refresh a different database with the same collection name', async (mutation) => {
    const write = deferred<unknown>();
    mutation.api.mockReturnValueOnce(write.promise);
    const mutating = mutation.run();
    mockApi.find.mockResolvedValueOnce({ ok: true, data: { docs: [{ name: 'Other database' }], totalCount: 1 } });
    await useStore.getState().selectCollection('otherdb', 'users');
    const newer = useStore.getState().acceptedResults;

    write.resolve(mutation.reply);
    expect(await mutating).toEqual(mutation.outcome);

    expect(mutation.api).toHaveBeenCalledWith(...mutation.args);
    expect(mockApi.find).toHaveBeenCalledTimes(1);
    expect(useStore.getState().acceptedResults).toBe(newer);
    expect(useStore.getState()).toMatchObject({ selectedDb: 'otherdb', loading: false, error: null });
  });

  it('returning to the same selection does not revive an old document write refresh', async () => {
    const write = deferred<Result<Record<string, unknown>>>();
    mockApi.insertOne.mockReturnValueOnce(write.promise);
    const inserting = useStore.getState().insertDoc({ name: 'Bob' });
    await useStore.getState().selectCollection('testdb', 'orders');
    await useStore.getState().selectCollection('testdb', 'users');
    await useStore.getState().runQuery('{ returned: true }');
    const returned = useStore.getState().acceptedResults;
    const readCount = mockApi.find.mock.calls.length;

    write.resolve({ ok: true, data: { _id: 'new', name: 'Bob' } });
    expect(await inserting).toBeNull();

    expect(useStore.getState().acceptedResults).toBe(returned);
    expect(mockApi.find).toHaveBeenCalledTimes(readCount);
  });

  it.each([mutations[0], mutations[5]])(
    '$name cannot refresh the same server and selection after reconnect',
    async (mutation) => {
      const write = deferred<unknown>();
      mutation.api.mockReturnValueOnce(write.promise);
      const mutating = mutation.run();
      mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
      mockApi.connect.mockResolvedValue({ ok: true, data: makeSession({ autoSelectedDb: 'testdb' }) });
      await useStore.getState().connect('mongodb://localhost');
      await useStore.getState().selectCollection('testdb', 'users');
      await useStore.getState().runQuery('{ newConnection: true }');
      const reconnected = useStore.getState().acceptedResults;
      const readCount = mockApi.find.mock.calls.length;

      write.resolve(mutation.reply);
      expect(await mutating).toEqual(mutation.outcome);

      expect(useStore.getState().acceptedResults).toBe(reconnected);
      expect(mockApi.find).toHaveBeenCalledTimes(readCount);
      expect(useStore.getState()).toMatchObject({
        status: { status: 'connected', connectionKey: 'localhost:27017' },
        loading: false,
        error: null,
      });
    }
  );

  it.each(['server rejection', 'invalid JSON', 'invalid shape'] as const)(
    'a pending document write cannot clear a newer Run error from %s',
    async (failure) => {
      const accepted = useStore.getState().acceptedResults;
      const write = deferred<Result<Record<string, unknown>>>();
      mockApi.updateOne.mockReturnValueOnce(write.promise);
      const updating = useStore.getState().updateDoc('123', { name: 'Bob' });
      mockApi.find.mockResolvedValueOnce({ ok: false, error: 'New condition rejected' });
      const text = failure === 'invalid JSON' ? '{ bad:' : failure === 'invalid shape' ? '[]' : '{ bad: true }';
      const error = await useStore.getState().runQuery(text);
      expect(error).toBeTruthy();
      const readCount = mockApi.find.mock.calls.length;

      write.resolve({ ok: true, data: { _id: '123', name: 'Bob' } });
      expect(await updating).toBeNull();

      expect(useStore.getState()).toMatchObject({ acceptedResults: accepted, loading: false, error });
      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(mockApi.find).toHaveBeenCalledTimes(readCount);
    }
  );

  it('a pending empty action leaves a newer read busy and allows only that reply to replace results', async () => {
    const accepted = useStore.getState().acceptedResults;
    const write = deferred<Result<number>>();
    const read = deferred<ReadResult>();
    mockApi.emptyCollection.mockReturnValueOnce(write.promise);
    mockApi.find.mockReturnValueOnce(read.promise);
    const emptying = useStore.getState().emptyCollection('testdb', 'users');
    const running = useStore.getState().runQuery('{ newest: true }');

    write.resolve({ ok: true, data: 61 });
    expect(await emptying).toEqual({ ok: true, data: 61 });

    expect(mockApi.find).toHaveBeenCalledTimes(1);
    expect(useStore.getState()).toMatchObject({ acceptedResults: accepted, loading: true, error: null });
    read.resolve({ ok: true, data: { docs: [{ name: 'Newest' }], totalCount: 1 } });
    await running;
    expect(useStore.getState().acceptedResults).toMatchObject({
      appliedQuery: { filter: { newest: true }, projection: { name: 1 }, skip: 0 },
      docs: [{ name: 'Newest' }],
      totalCount: 1,
    });
  });

  it.each(['success', 'failure'] as const)(
    'a mutation refresh completing with %s cannot overwrite a newer invalid Run',
    async (outcome) => {
      const accepted = useStore.getState().acceptedResults;
      const read = deferred<ReadResult>();
      const requested = deferred<void>();
      mockApi.find.mockImplementationOnce(() => {
        requested.resolve();
        return read.promise;
      });
      const inserting = useStore.getState().insertDoc({ name: 'Bob' });
      await requested.promise;
      const error = await useStore.getState().runQuery('{ bad:');
      read.resolve(
        outcome === 'success'
          ? { ok: true, data: { docs: [{ name: 'Stale refresh' }], totalCount: 62 } }
          : { ok: false, error: 'Stale refresh failure' }
      );
      expect(await inserting).toBeNull();

      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState()).toMatchObject({ loading: false, error });
    }
  );

  it('a late deletion refresh does not clear a newer read busy state or replace its accepted result', async () => {
    const accepted = useStore.getState().acceptedResults;
    const oldRead = deferred<ReadResult>();
    const newRead = deferred<ReadResult>();
    const requested = deferred<void>();
    mockApi.find
      .mockImplementationOnce(() => {
        requested.resolve();
        return oldRead.promise;
      })
      .mockReturnValueOnce(newRead.promise);
    const deleting = useStore.getState().deleteResults();
    await requested.promise;
    const running = useStore.getState().runQuery('{ newest: true }');

    oldRead.resolve({ ok: true, data: { docs: [{ name: 'Stale page one' }], totalCount: 58 } });
    expect(await deleting).toEqual({ ok: true, data: 3 });
    expect(useStore.getState()).toMatchObject({ acceptedResults: accepted, loading: true, error: null });

    newRead.resolve({ ok: true, data: { docs: [{ name: 'Newest' }], totalCount: 2 } });
    await running;
    expect(useStore.getState().acceptedResults).toMatchObject({
      appliedQuery: { filter: { newest: true }, projection: { name: 1 }, skip: 0 },
      docs: [{ name: 'Newest' }],
      totalCount: 2,
    });
  });

  it.each(['filter', 'aggregate'] as const)(
    'aggregate snapshots survive document mutations, empty and automatic refresh in %s editor mode',
    async (editorMode) => {
      const pipeline = [{ $match: { active: true } }, { $out: 'summary' }];
      useStore.getState().setQueryMode('aggregate');
      mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 61 }] });
      await useStore.getState().runQuery(JSON.stringify(pipeline));
      const snapshot = useStore.getState().acceptedResults;
      useStore.getState().setQueryMode(editorMode);
      mockApi.find.mockClear();
      mockApi.aggregate.mockClear();
      for (const mutation of [mutations[0], mutations[1], mutations[2], mutations[5]]) {
        expect(await mutation.run()).toEqual(mutation.outcome);
        expect(useStore.getState().acceptedResults).toBe(snapshot);
      }
      await useStore.getState().refreshDocs();

      expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ total: 61 }]));
      expect(useStore.getState().acceptedResults).toBe(snapshot);
      expect(mockApi.aggregate).not.toHaveBeenCalled();
      expect(mockApi.find).not.toHaveBeenCalled();
      expect(useStore.getState()).toMatchObject({ queryMode: editorMode, loading: false, error: null });
    }
  );

  it.each([
    { pipeline: [{ $match: { active: true } }, { $out: 'summary' }] },
    { pipeline: [{ $match: { active: true } }, { $merge: { into: 'summary', on: '_id', whenMatched: 'replace' } }] },
  ])(
    'only explicit Run replaces an aggregate snapshot and executes the complete output pipeline $pipeline',
    async ({ pipeline }) => {
      useStore.getState().setQueryMode('aggregate');
      mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 61 }] });
      await useStore.getState().runQuery('[]');
      const snapshot = useStore.getState().acceptedResults;
      mockApi.aggregate.mockClear();
      await useStore.getState().insertDoc({ name: 'Bob' });
      await useStore.getState().refreshDocs();
      expect(useStore.getState().acceptedResults).toBe(snapshot);
      expect(mockApi.aggregate).not.toHaveBeenCalled();

      mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 62 }] });
      expect(await useStore.getState().runQuery(JSON.stringify(pipeline))).toBeNull();

      expect(mockApi.aggregate).toHaveBeenCalledTimes(1);
      expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', pipeline);
      expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ total: 62 }]));
      expect(mockApi.find).not.toHaveBeenCalled();
    }
  );

  it.each(['success', 'failure'] as const)(
    'a stale filter refresh completing with %s cannot replace a newer accepted aggregate snapshot',
    async (outcome) => {
      const read = deferred<ReadResult>();
      const requested = deferred<void>();
      mockApi.find.mockImplementationOnce(() => {
        requested.resolve();
        return read.promise;
      });
      const inserting = useStore.getState().insertDoc({ name: 'Bob' });
      await requested.promise;
      useStore.getState().setQueryMode('aggregate');
      const pipeline = [{ $group: { _id: null, total: { $sum: 1 } } }, { $merge: 'summary' }];
      mockApi.aggregate.mockResolvedValueOnce({ ok: true, data: [{ total: 62 }] });
      await useStore.getState().runQuery(JSON.stringify(pipeline));
      const snapshot = useStore.getState().acceptedResults;

      read.resolve(
        outcome === 'success'
          ? { ok: true, data: { docs: [{ name: 'Stale filter rows' }], totalCount: 62 } }
          : { ok: false, error: 'Stale filter read failed' }
      );
      expect(await inserting).toBeNull();

      expect(useStore.getState().acceptedResults).toBe(snapshot);
      expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ total: 62 }]));
      expect(useStore.getState()).toMatchObject({ loading: false, error: null });
      expect(mockApi.aggregate).toHaveBeenCalledTimes(1);
    }
  );
});

describe('independent Explain activity', () => {
  beforeEach(async () => {
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'accepted' }], totalCount: 41 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });
    await useStore.getState().selectCollection('testdb', 'users');
    mockApi.find.mockClear();
  });

  it.each(['Explain first', 'rows first'] as const)(
    'accepts both overlapping reads independently when %s completes',
    async (completionOrder) => {
      const rows = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
      mockApi.find.mockReturnValueOnce(rows.promise);
      mockApi.explain.mockReturnValueOnce(explanation.promise);
      const rowRead = useStore.getState().runQuery('{ active: true }');
      const history = useStore.getState().queryHistory;
      const explainRead = useStore.getState().runExplain('{ name: "unsent" }');
      expect(useStore.getState()).toMatchObject({ loading: true, explainLoading: true });
      const output = { queryPlanner: { namespace: 'testdb.users' } };
      const rowResult = { ok: true as const, data: { docs: [{ _id: 'new rows' }], totalCount: 7 } };
      if (completionOrder === 'Explain first') {
        explanation.resolve({ ok: true, data: output });
        await explainRead;
        expect(useStore.getState()).toMatchObject({ loading: true, explainLoading: false, explainOutput: output });
        rows.resolve(rowResult);
        await rowRead;
      } else {
        rows.resolve(rowResult);
        await rowRead;
        expect(useStore.getState()).toMatchObject({ loading: false, explainLoading: true, explainOutput: null });
        explanation.resolve({ ok: true, data: output });
        await explainRead;
      }
      expect(useStore.getState()).toMatchObject({
        loading: false,
        explainLoading: false,
        explainOutput: output,
        fieldNames: ['_id', 'name'],
        acceptedResults: { docs: [{ _id: 'new rows' }], totalCount: 7, appliedQuery: { filter: { active: true } } },
      });
      expect(useStore.getState().queryHistory).toBe(history);
    }
  );

  it('keeps Explain pending while a newer row query and field discovery complete', async () => {
    const fields = Promise.withResolvers<Result<string[]>>();
    const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
    mockApi.sampleFields.mockReturnValueOnce(fields.promise);
    const selection = useStore.getState().selectCollection('testdb', 'orders');
    mockApi.explain.mockReturnValueOnce(explanation.promise);
    const explainRead = useStore.getState().runExplain('{}');
    await useStore.getState().runQuery('{ active: false }');
    fields.resolve({ ok: true, data: ['orderNumber'] });
    await selection;
    expect(useStore.getState()).toMatchObject({
      explainLoading: true,
      loading: false,
      fieldNames: ['orderNumber'],
      acceptedResults: { appliedQuery: { filter: { active: false } } },
    });
    explanation.resolve({ ok: true, data: { namespace: 'testdb.orders' } });
    expect(await explainRead).toEqual({ ok: true, data: { namespace: 'testdb.orders' } });
    expect(useStore.getState().explainOutput).toEqual({ namespace: 'testdb.orders' });
  });

  it.each(['old success', 'old failure', 'old rejection'] as const)(
    'only delivers the newest explanation and leaves its pending state intact after %s',
    async (oldReply) => {
      const old = Promise.withResolvers<Result<Record<string, unknown>>>();
      const latest = Promise.withResolvers<Result<Record<string, unknown>>>();
      mockApi.explain.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
      const accepted = useStore.getState().acceptedResults;
      const history = useStore.getState().queryHistory;
      const oldRead = useStore.getState().runExplain('{ old: true }');
      const latestRead = useStore.getState().runExplain('{ latest: true }');
      if (oldReply === 'old rejection') old.reject(new Error('obsolete transport error'));
      else
        old.resolve(oldReply === 'old success' ? { ok: true, data: { old: true } } : { ok: false, error: 'old error' });
      expect(await oldRead).toBeNull();
      expect(useStore.getState()).toMatchObject({ explainLoading: true, explainOutput: null, loading: false });
      latest.resolve({ ok: true, data: { latest: true } });
      expect(await latestRead).toEqual({ ok: true, data: { latest: true } });
      expect(useStore.getState()).toMatchObject({ explainLoading: false, explainOutput: { latest: true } });
      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState().queryHistory).toBe(history);
    }
  );

  it.each(['success', 'failure'] as const)(
    'retains the newest delivered diagnostic after an older %s arrives',
    async (oldReply) => {
      const old = Promise.withResolvers<Result<Record<string, unknown>>>();
      mockApi.explain.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ok: true, data: { newest: true } });
      const oldRead = useStore.getState().runExplain('{ old: true }');
      await useStore.getState().runExplain('{ newest: true }');
      old.resolve(oldReply === 'success' ? { ok: true, data: { old: true } } : { ok: false, error: 'obsolete error' });
      expect(await oldRead).toBeNull();
      expect(useStore.getState()).toMatchObject({
        explainLoading: false,
        explainOutput: { newest: true },
        loading: false,
        error: null,
      });
    }
  );

  it('does not reopen an older success after the newest explanation fails', async () => {
    const old = Promise.withResolvers<Result<Record<string, unknown>>>();
    mockApi.explain.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ok: false, error: 'newest failure' });
    const oldRead = useStore.getState().runExplain('{}');
    expect(await useStore.getState().runExplain('{ latest: true }')).toEqual({ ok: false, error: 'newest failure' });
    old.resolve({ ok: true, data: { old: true } });
    expect(await oldRead).toBeNull();
    expect(useStore.getState()).toMatchObject({ explainLoading: false, explainOutput: null, error: null });
  });

  it.each(['returned error', 'transport rejection', 'invalid JSON5', 'invalid aggregate shape'] as const)(
    'reports %s without clearing a pending row read or its error state',
    async (failure) => {
      const rows = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      mockApi.find.mockReturnValueOnce(rows.promise);
      const accepted = useStore.getState().acceptedResults;
      const rowRead = useStore.getState().runQuery('{}');
      useStore.setState({ error: 'row-owned error' });
      if (failure === 'transport rejection')
        mockApi.explain.mockRejectedValueOnce(new Error('Explain transport failed'));
      else mockApi.explain.mockResolvedValueOnce({ ok: false, error: 'Explain rejected' });
      if (failure === 'invalid aggregate shape') useStore.getState().setQueryMode('aggregate');
      const result = await useStore.getState().runExplain(failure === 'invalid JSON5' ? '{' : '{}');
      expect(result).toMatchObject({ ok: false, error: expect.any(String) });
      expect(useStore.getState()).toMatchObject({
        loading: true,
        explainLoading: false,
        explainOutput: null,
        error: 'row-owned error',
      });
      expect(useStore.getState().acceptedResults).toBe(accepted);
      if (failure.startsWith('invalid')) expect(mockApi.explain).not.toHaveBeenCalled();
      rows.resolve({ ok: true, data: { docs: [{ _id: 'completed row' }], totalCount: 1 } });
      await rowRead;
      expect(useStore.getState().acceptedResults?.docs).toEqual([{ _id: 'completed row' }]);
    }
  );

  it.each(['collection', 'database', 'disconnect', 'same-key reconnect', 'connection broadcast'] as const)(
    'suppresses success and error delivery across %s without clearing navigation loading',
    async (transition) => {
      for (const failed of [false, true]) {
        mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
        await useStore.getState().selectCollection('testdb', 'users');
        useStore.setState({ status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost' } });
        const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
        mockApi.explain.mockReturnValueOnce(explanation.promise);
        const explainRead = useStore.getState().runExplain('{}');
        const navigation = Promise.withResolvers<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
        const listing = Promise.withResolvers<Result<{ name: string; type: string }[]>>();
        const connection = Promise.withResolvers<Result<ConnectedSession>>();
        let pendingNavigation: Promise<unknown> | undefined;
        if (transition === 'collection') {
          mockApi.find.mockReturnValueOnce(navigation.promise);
          pendingNavigation = useStore.getState().selectCollection('testdb', 'orders');
        } else if (transition === 'database') {
          mockApi.listCollections.mockReturnValueOnce(listing.promise);
          pendingNavigation = useStore.getState().selectDb('otherdb');
        } else if (transition === 'disconnect') {
          await useStore.getState().disconnect();
        } else if (transition === 'same-key reconnect') {
          mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
          mockApi.connect.mockReturnValueOnce(connection.promise);
          pendingNavigation = useStore.getState().connect('mongodb://localhost');
          await Promise.resolve();
        } else {
          useStore.getState().subscribeToConnectionState();
          const broadcast = mockApi.onConnectionState.mock.calls.at(-1)![0];
          broadcast({ status: 'connecting', uri: 'mongodb://localhost' });
          broadcast({ status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost' });
          mockApi.find.mockReturnValueOnce(navigation.promise);
          pendingNavigation = useStore.getState().selectCollection('testdb', 'users');
        }
        explanation.resolve(
          failed ? { ok: false, error: 'obsolete Explain error' } : { ok: true, data: { old: true } }
        );
        expect(await explainRead).toBeNull();
        expect(useStore.getState()).toMatchObject({
          explainLoading: false,
          explainOutput: null,
          loading: transition !== 'disconnect',
          error: null,
        });
        navigation.resolve({ ok: true, data: { docs: [{ _id: 'new selection' }], totalCount: 1 } });
        listing.resolve({ ok: true, data: [{ name: 'new collection', type: 'collection' }] });
        connection.resolve({ ok: true, data: makeSession() });
        await pendingNavigation;
      }
    }
  );

  it('clears an already delivered diagnostic on selection and same-key reconnect', async () => {
    mockApi.explain.mockResolvedValue({ ok: true, data: { namespace: 'testdb.users' } });
    await useStore.getState().runExplain('{}');
    expect(useStore.getState().explainOutput).toEqual({ namespace: 'testdb.users' });
    await useStore.getState().selectCollection('testdb', 'orders');
    expect(useStore.getState().explainOutput).toBeNull();
    await useStore.getState().runExplain('{}');
    useStore.setState({ status: { status: 'connected', uri: 'mongodb://localhost', connectionKey: 'localhost' } });
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.connect.mockResolvedValue({ ok: true, data: makeSession() });
    await useStore.getState().connect('mongodb://localhost');
    expect(useStore.getState().explainOutput).toBeNull();
  });

  it('captures JSON5 text, QueryMode and target without adopting projection or changing history', async () => {
    const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
    mockApi.explain.mockReturnValueOnce(explanation.promise);
    await useStore.getState().applyProjection('{ name: 1 }');
    const accepted = useStore.getState().acceptedResults;
    const history = useStore.getState().queryHistory;
    const historyIndex = useStore.getState().historyIndex;
    useStore.getState().setQueryMode('aggregate');
    const read = useStore.getState().runExplain('[{ $match: { active: true, }, }]');
    useStore.getState().setQueryMode('filter');
    expect(mockApi.explain).toHaveBeenCalledWith('testdb', 'users', 'aggregate', [{ $match: { active: true } }]);
    explanation.resolve({ ok: true, data: { aggregatePlan: true } });
    await read;
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(useStore.getState().queryHistory).toBe(history);
    expect(useStore.getState().historyIndex).toBe(historyIndex);
    expect(useStore.getState().projection).toEqual({ name: 1 });
  });

  it('does not supersede the accepted-filter refresh after a pending document mutation', async () => {
    const write = Promise.withResolvers<Result<unknown>>();
    const explanation = Promise.withResolvers<Result<Record<string, unknown>>>();
    mockApi.updateOne.mockReturnValueOnce(write.promise);
    mockApi.explain.mockReturnValueOnce(explanation.promise);
    const mutation = useStore.getState().updateDoc('accepted', { name: 'updated' });
    const read = useStore.getState().runExplain('{ diagnosticOnly: true }');
    write.resolve({ ok: true, data: undefined });
    expect(await mutation).toBeNull();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', { filter: {}, skip: 0, limit: 20 });
    expect(useStore.getState().explainLoading).toBe(true);
    explanation.resolve({ ok: true, data: { plan: 'independent' } });
    await read;
  });
});

describe('collection sort preferences', () => {
  const namespace = '["testdb","users"]';
  const connectionKey = 'localhost:27017';

  beforeEach(() => {
    useStore.setState({
      status: { status: 'connected', uri: 'mongodb://localhost', connectionKey },
      selectedDb: 'testdb',
      selectedCollection: 'users',
      acceptedResults: filterResults({}, [{ _id: 'initial' }]),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'accepted' }], totalCount: 1 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    mockApi.listCollections.mockResolvedValue({ ok: true, data: [] });
  });

  it.each([
    { clicks: 1, sort: { name: 1 } },
    { clicks: 2, sort: { name: -1 } },
    { clicks: 3, sort: null },
  ] as const)(
    'retains a successful $clicks-click sort through navigation, new filters and history replay',
    async ({ clicks, sort }) => {
      for (let click = 0; click < clicks; click++) await useStore.getState().setSort('name');
      expect(useStore.getState().collectionSorts).toEqual({ [namespace]: sort });
      expect(mockApi.saveCollectionSort).toHaveBeenLastCalledWith({
        connectionKey,
        db: 'testdb',
        collection: 'users',
        sort,
      });

      await useStore.getState().selectCollection('testdb', 'orders');
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ collection: 'orders', sort: null });
      await useStore.getState().selectCollection('testdb', 'users');
      expect(useStore.getState().acceptedResults).toMatchObject({
        appliedQuery: { collection: 'users', filter: {}, sort, skip: 0 },
        docs: [{ _id: 'accepted' }],
      });

      await useStore.getState().runQuery('{ active: true }');
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ filter: { active: true }, sort });
      await useStore.getState().selectCollection('otherdb', 'users');
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ db: 'otherdb', sort: null });
      await useStore.getState().restoreFromHistory({
        id: 'saved-query',
        db: 'testdb',
        collection: 'users',
        queryMode: 'filter',
        query: '{ active: false }',
        timestamp: 1,
      });
      expect(useStore.getState().acceptedResults).toMatchObject({
        appliedQuery: { db: 'testdb', collection: 'users', filter: { active: false }, sort, skip: 0 },
        docs: [{ _id: 'accepted' }],
      });
      expect(useStore.getState().collectionSorts).toEqual({ [namespace]: sort });
    }
  );

  it('keeps the accepted sort and saved preference when descending and clear queries fail', async () => {
    await useStore.getState().setSort('name');
    const ascending = useStore.getState().acceptedResults;
    mockApi.saveCollectionSort.mockClear();
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Descending rejected' });
    await useStore.getState().setSort('name');
    expect(useStore.getState().acceptedResults).toBe(ascending);
    expect(useStore.getState().collectionSorts).toEqual({ [namespace]: { name: 1 } });
    expect(mockApi.saveCollectionSort).not.toHaveBeenCalled();

    await useStore.getState().setSort('name');
    const descending = useStore.getState().acceptedResults;
    mockApi.saveCollectionSort.mockClear();
    mockApi.find.mockResolvedValueOnce({ ok: false, error: 'Clear rejected' });
    await useStore.getState().setSort('name');
    expect(useStore.getState().acceptedResults).toBe(descending);
    expect(useStore.getState().collectionSorts).toEqual({ [namespace]: { name: -1 } });
    expect(mockApi.saveCollectionSort).not.toHaveBeenCalled();
    await useStore.getState().selectCollection('testdb', 'orders');
    await useStore.getState().selectCollection('testdb', 'users');
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: { name: -1 } });
  });

  it('does not persist a late successful sort after a newer sort has been accepted', async () => {
    await useStore.getState().setSort('name');
    mockApi.saveCollectionSort.mockClear();
    const late = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    mockApi.find.mockReturnValueOnce(late.promise);
    const superseded = useStore.getState().setSort('name');
    await useStore.getState().setSort('age');
    const accepted = useStore.getState().acceptedResults;
    late.resolve({ ok: true, data: { docs: [{ _id: 'stale-descending' }], totalCount: 1 } });
    await superseded;
    expect(useStore.getState().acceptedResults).toBe(accepted);
    expect(accepted?.appliedQuery).toMatchObject({ sort: { age: 1 } });
    expect(useStore.getState().collectionSorts).toEqual({ [namespace]: { age: 1 } });
    expect(mockApi.saveCollectionSort).toHaveBeenCalledTimes(1);
    expect(mockApi.saveCollectionSort).toHaveBeenCalledWith({
      connectionKey,
      db: 'testdb',
      collection: 'users',
      sort: { age: 1 },
    });
  });

  it('does not save a successful sort response superseded by collection navigation', async () => {
    await useStore.getState().setSort('name');
    mockApi.saveCollectionSort.mockClear();
    const late = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
    mockApi.find.mockReturnValueOnce(late.promise);
    const superseded = useStore.getState().setSort('name');
    await useStore.getState().selectCollection('testdb', 'orders');
    late.resolve({ ok: true, data: { docs: [{ _id: 'stale' }], totalCount: 1 } });
    await superseded;
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ collection: 'orders', sort: null });
    expect(mockApi.saveCollectionSort).not.toHaveBeenCalled();
    await useStore.getState().selectCollection('testdb', 'users');
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: { name: 1 } });
  });

  it.each(['before', 'after'] as const)(
    'restores sort after reconnect with connected broadcast %s hydration and isolates another connection',
    async (connectedOrder) => {
      const uri = 'mongodb://localhost:27017';
      const connected: ConnectionState = { status: 'connected', uri, connectionKey };
      let emit: (state: ConnectionState) => void = () => {};
      mockApi.onConnectionState.mockImplementation((callback) => {
        emit = callback;
        return () => {};
      });
      const unsubscribe = useStore.getState().subscribeToConnectionState();
      try {
        await useStore.getState().disconnect();
        expect(useStore.getState().collectionSorts).toEqual({});
        mockApi.connect.mockImplementation(async () => {
          emit({ status: 'connecting', uri });
          if (connectedOrder === 'before') emit(connected);
          return {
            ok: true,
            data: makeSession({
              uri,
              collectionSorts: { [namespace]: { name: -1 } },
              collectionColumnWidths: { [namespace]: { name: 240 } },
            }),
          };
        });
        await useStore.getState().connect(uri);
        if (connectedOrder === 'after') emit(connected);
        await useStore.getState().selectCollection('testdb', 'users');
        expect(useStore.getState().acceptedResults).toMatchObject({
          appliedQuery: { sort: { name: -1 } },
          docs: [{ _id: 'accepted' }],
        });
        expect(useStore.getState().collectionSorts).toEqual({ [namespace]: { name: -1 } });
        expect(useStore.getState().collectionColumnWidths).toEqual({ [namespace]: { name: 240 } });

        await useStore.getState().disconnect();
        const otherUri = 'mongodb://localhost:27018';
        mockApi.connect.mockImplementation(async () => {
          emit({ status: 'connected', uri: otherUri, connectionKey: 'localhost:27018' });
          return { ok: true, data: makeSession({ uri: otherUri }) };
        });
        await useStore.getState().connect(otherUri);
        await useStore.getState().selectCollection('testdb', 'users');
        expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: null });
        expect(useStore.getState().collectionSorts).toEqual({});
      } finally {
        unsubscribe();
      }
    }
  );

  it('keeps saved filter sort out of aggregate execution and aggregate history replay', async () => {
    await useStore.getState().setSort('name');
    mockApi.saveCollectionSort.mockClear();
    const pipeline = [{ $match: { active: true } }, { $sort: { age: -1 } }];
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [{ _id: 'aggregate' }] });
    useStore.getState().setQueryMode('aggregate');
    await useStore.getState().runQuery(JSON.stringify(pipeline));
    expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ _id: 'aggregate' }]));
    await useStore.getState().restoreFromHistory({
      id: 'aggregate-history',
      db: 'testdb',
      collection: 'users',
      queryMode: 'aggregate',
      query: JSON.stringify(pipeline),
      timestamp: 1,
    });
    expect(useStore.getState().acceptedResults).toEqual(aggregateResults({ pipeline }, [{ _id: 'aggregate' }]));
    expect(mockApi.aggregate).toHaveBeenLastCalledWith('testdb', 'users', pipeline);
    expect(mockApi.saveCollectionSort).not.toHaveBeenCalled();
    expect(useStore.getState().collectionSorts).toEqual({ [namespace]: { name: 1 } });
    useStore.getState().setQueryMode('filter');
    await useStore.getState().runQuery('{}');
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: { name: 1 } });
  });
});

describe('sort preference hydration races', () => {
  it('keeps dotted collection names distinct from similarly joined database and collection names', async () => {
    mockApi.connect.mockResolvedValue({
      ok: true,
      data: makeSession({
        collectionSorts: {
          '["testdb","users.archive"]': { name: 1 },
          '["testdb.users","archive"]': { age: -1 },
        },
      }),
    });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'accepted' }], totalCount: 1 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    await useStore.getState().connect('mongodb://localhost');
    await useStore.getState().selectCollection('testdb', 'users.archive');
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({
      db: 'testdb',
      collection: 'users.archive',
      sort: { name: 1 },
    });
    await useStore.getState().selectCollection('testdb.users', 'archive');
    expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({
      db: 'testdb.users',
      collection: 'archive',
      sort: { age: -1 },
    });
  });

  it.each(['pending', 'accepted'] as const)(
    'restores the hydrated sort when early navigation is already %s and rejects its older unsorted response',
    async (selectionState) => {
      const uri = 'mongodb://localhost:27017';
      let emit: (state: ConnectionState) => void = () => {};
      mockApi.onConnectionState.mockImplementation((callback) => {
        emit = callback;
        return () => {};
      });
      const unsubscribe = useStore.getState().subscribeToConnectionState();
      const reply = deferred<Result<ConnectedSession>>();
      const earlyRows = deferred<Result<{ docs: Record<string, unknown>[]; totalCount: number }>>();
      const unsortedRows = { ok: true as const, data: { docs: [{ _id: 'unsorted' }], totalCount: 1 } };
      mockApi.connect.mockReturnValueOnce(reply.promise);
      mockApi.find
        .mockReturnValueOnce(earlyRows.promise)
        .mockResolvedValue({ ok: true, data: { docs: [{ _id: 'sorted' }], totalCount: 1 } });
      mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
      try {
        const connecting = useStore.getState().connect(uri);
        emit({ status: 'connected', uri, connectionKey: 'localhost:27017' });
        const selecting = useStore.getState().selectCollection('testdb', 'users');
        if (selectionState === 'accepted') {
          earlyRows.resolve(unsortedRows);
          await selecting;
          expect(useStore.getState().acceptedResults?.docs).toEqual([{ _id: 'unsorted' }]);
        }
        reply.resolve({
          ok: true,
          data: makeSession({ uri, collectionSorts: { '["testdb","users"]': { name: -1 } } }),
        });
        await connecting;
        expect(useStore.getState().acceptedResults).toMatchObject({
          appliedQuery: { db: 'testdb', collection: 'users', sort: { name: -1 } },
          docs: [{ _id: 'sorted' }],
        });
        const restored = useStore.getState().acceptedResults;
        if (selectionState === 'pending') earlyRows.resolve(unsortedRows);
        await selecting;
        expect(useStore.getState().acceptedResults).toBe(restored);
        expect(mockApi.find).toHaveBeenLastCalledWith('testdb', 'users', {
          filter: {},
          sort: { name: -1 },
          skip: 0,
          limit: 20,
        });
        expect(mockApi.saveCollectionSort).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    }
  );

  it('retains a newer accepted sort when the persisted connect snapshot arrives late', async () => {
    const uri = 'mongodb://localhost:27017';
    const connectionKey = 'localhost:27017';
    let emit: (state: ConnectionState) => void = () => {};
    mockApi.onConnectionState.mockImplementation((callback) => {
      emit = callback;
      return () => {};
    });
    const unsubscribe = useStore.getState().subscribeToConnectionState();
    const reply = deferred<Result<ConnectedSession>>();
    mockApi.connect.mockReturnValueOnce(reply.promise);
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ _id: 'new-sort' }], totalCount: 1 } });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });
    try {
      const connecting = useStore.getState().connect(uri);
      emit({ status: 'connected', uri, connectionKey });
      await useStore.getState().selectCollection('testdb', 'users');
      await useStore.getState().setSort('age');
      const accepted = useStore.getState().acceptedResults;
      reply.resolve({
        ok: true,
        data: makeSession({
          uri,
          collectionSorts: {
            '["testdb","users"]': { name: -1 },
            '["testdb","orders"]': { total: 1 },
          },
        }),
      });
      await connecting;
      expect(useStore.getState().acceptedResults).toBe(accepted);
      expect(useStore.getState().collectionSorts).toEqual({
        '["testdb","users"]': { age: 1 },
        '["testdb","orders"]': { total: 1 },
      });
      await useStore.getState().selectCollection('testdb', 'orders');
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: { total: 1 } });
      await useStore.getState().selectCollection('testdb', 'users');
      expect(useStore.getState().acceptedResults?.appliedQuery).toMatchObject({ sort: { age: 1 } });
    } finally {
      unsubscribe();
    }
  });
});
