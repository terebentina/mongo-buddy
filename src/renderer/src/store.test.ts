import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from './store';

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
  sampleFields: vi.fn(),
  loadHistory: vi.fn().mockResolvedValue([]),
  saveHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  distinct: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    connected: false,
    uri: '',
    databases: [],
    collections: [],
    selectedDb: null,
    selectedCollection: null,
    docs: [],
    totalCount: 0,
    skip: 0,
    limit: 20,
    filter: {},
    error: null,
    loading: false,
    savedConnections: [],
    queryMode: 'filter' as const,
    fieldNames: [],
    pendingFilterText: null,
    queryHistory: [],
    pendingQueryMode: null,
  });
  (window as unknown as Record<string, unknown>).api = mockApi;
});

describe('store', () => {
  it('connect(uri) sets connected=true and loads databases and history', async () => {
    const historyEntries = [
      { id: '1', type: 'filter' as const, query: '{}', db: 'test', collection: 'users', timestamp: 1000 },
    ];
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }],
    });
    mockApi.loadHistory.mockResolvedValue(historyEntries);

    await useStore.getState().connect('mongodb://localhost');

    const state = useStore.getState();
    expect(state.connected).toBe(true);
    expect(state.uri).toBe('mongodb://localhost');
    expect(state.databases).toEqual([{ name: 'testdb', sizeOnDisk: 1024, empty: false }]);
    expect(state.queryHistory).toEqual(historyEntries);
    expect(state.selectedDb).toBe('testdb');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
    expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost');
    expect(mockApi.listDatabases).toHaveBeenCalled();
    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb');
    expect(mockApi.loadHistory).toHaveBeenCalled();
  });

  it('connect() does not auto-select when multiple databases exist', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [
        { name: 'db1', sizeOnDisk: 1024, empty: false },
        { name: 'db2', sizeOnDisk: 2048, empty: false },
      ],
    });

    await useStore.getState().connect('mongodb://localhost');

    const state = useStore.getState();
    expect(state.connected).toBe(true);
    expect(state.selectedDb).toBeNull();
    expect(state.collections).toEqual([]);
    expect(mockApi.listCollections).not.toHaveBeenCalled();
  });

  it('connect() auto-select handles listCollections failure gracefully', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
    });
    mockApi.listCollections.mockResolvedValue({ ok: false, error: 'Not authorized' });

    await useStore.getState().connect('mongodb://localhost');

    const state = useStore.getState();
    expect(state.connected).toBe(true);
    expect(state.selectedDb).toBe('testdb');
    expect(state.collections).toEqual([]);
  });

  it('connect failure sets error, connected=false', async () => {
    mockApi.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });

    await useStore.getState().connect('mongodb://badhost');

    const state = useStore.getState();
    expect(state.connected).toBe(false);
    expect(state.error).toBe('Connection refused');
  });

  it('selectDb(db) loads collections', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }],
    });

    await useStore.getState().selectDb('testdb');

    const state = useStore.getState();
    expect(state.selectedDb).toBe('testdb');
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }]);
    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb');
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

  it('disconnect() resets state', async () => {
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined });

    // Set some state first
    useStore.setState({
      connected: true,
      uri: 'mongodb://localhost',
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });

    await useStore.getState().disconnect();

    const state = useStore.getState();
    expect(state.connected).toBe(false);
    expect(state.uri).toBe('');
    expect(state.databases).toEqual([]);
    expect(state.selectedDb).toBeNull();
    expect(state.selectedCollection).toBeNull();
    expect(state.docs).toEqual([]);
    expect(mockApi.disconnect).toHaveBeenCalled();
  });

  it('connect(uri) calls setLastUsed on success', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] });
    mockApi.setLastUsed.mockResolvedValue(undefined);

    await useStore.getState().connect('mongodb://localhost');

    expect(mockApi.setLastUsed).toHaveBeenCalledWith('mongodb://localhost');
  });

  it('loadSavedConnections() fetches and sets savedConnections', async () => {
    const conns = [{ name: 'Local', uri: 'mongodb://localhost:27017' }];
    mockApi.listConnections.mockResolvedValue(conns);

    await useStore.getState().loadSavedConnections();

    expect(useStore.getState().savedConnections).toEqual(conns);
  });

  it('saveConnection(name, uri) saves and reloads list', async () => {
    mockApi.saveConnection.mockResolvedValue(undefined);
    mockApi.listConnections.mockResolvedValue([{ name: 'Local', uri: 'mongodb://localhost:27017' }]);

    await useStore.getState().saveConnection('Local', 'mongodb://localhost:27017');

    expect(mockApi.saveConnection).toHaveBeenCalledWith({ name: 'Local', uri: 'mongodb://localhost:27017' });
    expect(useStore.getState().savedConnections).toHaveLength(1);
  });

  it('deleteConnection(name) removes and reloads list', async () => {
    mockApi.deleteConnection.mockResolvedValue(undefined);
    mockApi.listConnections.mockResolvedValue([]);

    useStore.setState({ savedConnections: [{ name: 'Local', uri: 'mongodb://localhost:27017' }] });
    await useStore.getState().deleteConnection('Local');

    expect(mockApi.deleteConnection).toHaveBeenCalledWith('Local');
    expect(useStore.getState().savedConnections).toEqual([]);
  });

  it('autoReconnect() connects with last used URI', async () => {
    mockApi.getLastUsed.mockResolvedValue('mongodb://localhost:27017');
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined });
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] });
    mockApi.setLastUsed.mockResolvedValue(undefined);

    await useStore.getState().autoReconnect();

    expect(mockApi.getLastUsed).toHaveBeenCalled();
    expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
    expect(useStore.getState().connected).toBe(true);
  });

  it('autoReconnect() does nothing when no last used URI', async () => {
    mockApi.getLastUsed.mockResolvedValue(null);

    await useStore.getState().autoReconnect();

    expect(mockApi.connect).not.toHaveBeenCalled();
    expect(useStore.getState().connected).toBe(false);
  });

  it('runQuery() in filter mode calls find with parsed filter', async () => {
    useStore.setState({
      connected: true,
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
      connected: true,
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
      connected: true,
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
    expect(state.queryHistory[0].type).toBe('filter');
    expect(state.queryHistory[0].query).toBe('{"name":"Alice"}');
    expect(state.queryHistory[0].db).toBe('testdb');
    expect(state.queryHistory[0].collection).toBe('users');
  });

  it('runQuery() returns error string for invalid JSON', async () => {
    useStore.setState({
      connected: true,
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });

    const error = await useStore.getState().runQuery('{bad json}');

    expect(error).toBeTruthy();
    expect(typeof error).toBe('string');
    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('setQueryMode() toggles between filter and aggregate', () => {
    expect(useStore.getState().queryMode).toBe('filter');
    useStore.getState().setQueryMode('aggregate');
    expect(useStore.getState().queryMode).toBe('aggregate');
    useStore.getState().setQueryMode('filter');
    expect(useStore.getState().queryMode).toBe('filter');
  });

  it('insertDoc() calls insertOne and refreshes docs', async () => {
    useStore.setState({
      connected: true,
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
      connected: true,
      selectedDb: 'testdb',
      selectedCollection: 'users',
    });
    mockApi.insertOne.mockResolvedValue({ ok: false, error: 'Duplicate key' });

    const error = await useStore.getState().insertDoc({ name: 'Alice' });

    expect(error).toBe('Duplicate key');
  });

  it('updateDoc() calls updateOne and refreshes docs', async () => {
    useStore.setState({
      connected: true,
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

  it('deleteDoc() calls deleteOne and refreshes docs', async () => {
    useStore.setState({
      connected: true,
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

describe('addToHistory', () => {
  const makeEntry = (overrides = {}) => ({
    id: 'test-id',
    type: 'filter' as const,
    query: '{"name":"Alice"}',
    db: 'testdb',
    collection: 'users',
    timestamp: 1000,
    ...overrides,
  });

  it('prepends entry to queryHistory', () => {
    useStore.getState().addToHistory(makeEntry({ id: '1' }));
    useStore.getState().addToHistory(makeEntry({ id: '2', query: '{"age":30}' }));

    const history = useStore.getState().queryHistory;
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('2');
    expect(history[1].id).toBe('1');
  });

  it('deduplicates when top entry has same query+db+collection+type', () => {
    useStore.getState().addToHistory(makeEntry({ id: '1' }));
    useStore.getState().addToHistory(makeEntry({ id: '2' }));

    const history = useStore.getState().queryHistory;
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('1');
  });

  it('caps queryHistory at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      useStore.getState().addToHistory(makeEntry({ id: `id-${i}`, query: `{"i":${i}}` }));
    }

    expect(useStore.getState().queryHistory).toHaveLength(50);
  });
});

describe('switchCollection', () => {
  it('sets selectedDb and selectedCollection and fetches fields', async () => {
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });

    await useStore.getState().switchCollection('testdb', 'users');

    const state = useStore.getState();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.fieldNames).toEqual(['_id', 'name']);
    expect(mockApi.sampleFields).toHaveBeenCalledWith('testdb', 'users');
  });

  it('does NOT call find', async () => {
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });

    await useStore.getState().switchCollection('testdb', 'users');

    expect(mockApi.find).not.toHaveBeenCalled();
  });

  it('does NOT set pendingFilterText', async () => {
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: [] });

    await useStore.getState().switchCollection('testdb', 'users');

    expect(useStore.getState().pendingFilterText).toBeNull();
  });
});

describe('restoreFromHistory', () => {
  const makeEntry = (overrides = {}) => ({
    id: 'test-id',
    type: 'filter' as const,
    query: '{"name":"Alice"}',
    db: 'testdb',
    collection: 'users',
    timestamp: 1000,
    ...overrides,
  });

  it('same collection sets pendingFilterText and pendingQueryMode without calling sampleFields', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });

    await useStore.getState().restoreFromHistory(makeEntry());

    const state = useStore.getState();
    expect(state.pendingFilterText).toBe('{"name":"Alice"}');
    expect(state.pendingQueryMode).toBe('filter');
    expect(mockApi.sampleFields).not.toHaveBeenCalled();
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', { filter: { name: 'Alice' }, skip: 0, limit: 20 });
    expect(state.docs).toEqual([{ name: 'Alice' }]);
    expect(state.totalCount).toBe(1);
  });

  it('different collection calls switchCollection (sampleFields) then sets pending state', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'orders' });
    mockApi.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [{ name: 'Alice' }], totalCount: 1 } });

    await useStore.getState().restoreFromHistory(makeEntry());

    const state = useStore.getState();
    expect(state.selectedDb).toBe('testdb');
    expect(state.selectedCollection).toBe('users');
    expect(state.pendingFilterText).toBe('{"name":"Alice"}');
    expect(state.pendingQueryMode).toBe('filter');
    expect(mockApi.sampleFields).toHaveBeenCalledWith('testdb', 'users');
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', { filter: { name: 'Alice' }, skip: 0, limit: 20 });
  });

  it('aggregate entry sets pendingQueryMode to aggregate and executes', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    mockApi.aggregate.mockResolvedValue({ ok: true, data: [{ _id: 1 }] });

    await useStore.getState().restoreFromHistory(makeEntry({ type: 'aggregate', query: '[{"$match":{}}]' }));

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

    await useStore.getState().restoreFromHistory(makeEntry({ type: 'aggregate', query: '[{"$match":{}}]' }));

    expect(useStore.getState().filter).toEqual({});
  });

  it('addFilterValue after restoring empty history produces correct filter', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users', filter: { status: 'active' } });
    mockApi.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });

    await useStore.getState().restoreFromHistory(makeEntry({ query: '{}' }));
    useStore.getState().addFilterValue('name', 'Bob');

    expect(useStore.getState().filter).toEqual({ name: 'Bob' });
  });
});

describe('fetchDistinct', () => {
  it('calls window.api.distinct with current db, collection, and field', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    const apiResult = { ok: true as const, data: { values: ['active', 'inactive'], truncated: false } };
    mockApi.distinct.mockResolvedValue(apiResult);

    const result = await useStore.getState().fetchDistinct('status');

    expect(mockApi.distinct).toHaveBeenCalledWith('testdb', 'users', 'status');
    expect(result).toEqual(apiResult);
  });

  it('returns null when no collection selected', async () => {
    useStore.setState({ selectedDb: null, selectedCollection: null });

    const result = await useStore.getState().fetchDistinct('status');

    expect(result).toBeNull();
    expect(mockApi.distinct).not.toHaveBeenCalled();
  });

  it('returns the API result directly', async () => {
    useStore.setState({ selectedDb: 'testdb', selectedCollection: 'users' });
    const errorResult = { ok: false as const, error: 'Query failed' };
    mockApi.distinct.mockResolvedValue(errorResult);

    const result = await useStore.getState().fetchDistinct('status');

    expect(result).toEqual(errorResult);
  });
});
