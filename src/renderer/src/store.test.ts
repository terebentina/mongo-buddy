import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './store'

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  getLastUsed: vi.fn(),
  setLastUsed: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
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
    queryMode: 'filter' as const
  })
  ;(window as any).api = mockApi
})

describe('store', () => {
  it('connect(uri) sets connected=true and loads databases', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined })
    mockApi.listDatabases.mockResolvedValue({
      ok: true,
      data: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }]
    })

    await useStore.getState().connect('mongodb://localhost')

    const state = useStore.getState()
    expect(state.connected).toBe(true)
    expect(state.uri).toBe('mongodb://localhost')
    expect(state.databases).toEqual([{ name: 'testdb', sizeOnDisk: 1024, empty: false }])
    expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost')
    expect(mockApi.listDatabases).toHaveBeenCalled()
  })

  it('connect failure sets error, connected=false', async () => {
    mockApi.connect.mockResolvedValue({ ok: false, error: 'Connection refused' })

    await useStore.getState().connect('mongodb://badhost')

    const state = useStore.getState()
    expect(state.connected).toBe(false)
    expect(state.error).toBe('Connection refused')
  })

  it('selectDb(db) loads collections', async () => {
    mockApi.listCollections.mockResolvedValue({
      ok: true,
      data: [{ name: 'users', type: 'collection' }]
    })

    await useStore.getState().selectDb('testdb')

    const state = useStore.getState()
    expect(state.selectedDb).toBe('testdb')
    expect(state.collections).toEqual([{ name: 'users', type: 'collection' }])
    expect(mockApi.listCollections).toHaveBeenCalledWith('testdb')
  })

  it('selectCollection(db, coll) loads docs', async () => {
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 }
    })

    await useStore.getState().selectCollection('testdb', 'users')

    const state = useStore.getState()
    expect(state.selectedDb).toBe('testdb')
    expect(state.selectedCollection).toBe('users')
    expect(state.docs).toEqual([{ _id: '1', name: 'Alice' }])
    expect(state.totalCount).toBe(1)
    expect(state.skip).toBe(0)
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: {},
      skip: 0,
      limit: 20
    })
  })

  it('disconnect() resets state', async () => {
    mockApi.disconnect.mockResolvedValue({ ok: true, data: undefined })

    // Set some state first
    useStore.setState({
      connected: true,
      uri: 'mongodb://localhost',
      databases: [{ name: 'testdb', sizeOnDisk: 1024, empty: false }],
      selectedDb: 'testdb',
      selectedCollection: 'users'
    })

    await useStore.getState().disconnect()

    const state = useStore.getState()
    expect(state.connected).toBe(false)
    expect(state.uri).toBe('')
    expect(state.databases).toEqual([])
    expect(state.selectedDb).toBeNull()
    expect(state.selectedCollection).toBeNull()
    expect(state.docs).toEqual([])
    expect(mockApi.disconnect).toHaveBeenCalled()
  })

  it('connect(uri) calls setLastUsed on success', async () => {
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined })
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] })
    mockApi.setLastUsed.mockResolvedValue(undefined)

    await useStore.getState().connect('mongodb://localhost')

    expect(mockApi.setLastUsed).toHaveBeenCalledWith('mongodb://localhost')
  })

  it('loadSavedConnections() fetches and sets savedConnections', async () => {
    const conns = [{ name: 'Local', uri: 'mongodb://localhost:27017' }]
    mockApi.listConnections.mockResolvedValue(conns)

    await useStore.getState().loadSavedConnections()

    expect(useStore.getState().savedConnections).toEqual(conns)
  })

  it('saveConnection(name, uri) saves and reloads list', async () => {
    mockApi.saveConnection.mockResolvedValue(undefined)
    mockApi.listConnections.mockResolvedValue([{ name: 'Local', uri: 'mongodb://localhost:27017' }])

    await useStore.getState().saveConnection('Local', 'mongodb://localhost:27017')

    expect(mockApi.saveConnection).toHaveBeenCalledWith({ name: 'Local', uri: 'mongodb://localhost:27017' })
    expect(useStore.getState().savedConnections).toHaveLength(1)
  })

  it('deleteConnection(name) removes and reloads list', async () => {
    mockApi.deleteConnection.mockResolvedValue(undefined)
    mockApi.listConnections.mockResolvedValue([])

    useStore.setState({ savedConnections: [{ name: 'Local', uri: 'mongodb://localhost:27017' }] })
    await useStore.getState().deleteConnection('Local')

    expect(mockApi.deleteConnection).toHaveBeenCalledWith('Local')
    expect(useStore.getState().savedConnections).toEqual([])
  })

  it('autoReconnect() connects with last used URI', async () => {
    mockApi.getLastUsed.mockResolvedValue('mongodb://localhost:27017')
    mockApi.connect.mockResolvedValue({ ok: true, data: undefined })
    mockApi.listDatabases.mockResolvedValue({ ok: true, data: [] })
    mockApi.setLastUsed.mockResolvedValue(undefined)

    await useStore.getState().autoReconnect()

    expect(mockApi.getLastUsed).toHaveBeenCalled()
    expect(mockApi.connect).toHaveBeenCalledWith('mongodb://localhost:27017')
    expect(useStore.getState().connected).toBe(true)
  })

  it('autoReconnect() does nothing when no last used URI', async () => {
    mockApi.getLastUsed.mockResolvedValue(null)

    await useStore.getState().autoReconnect()

    expect(mockApi.connect).not.toHaveBeenCalled()
    expect(useStore.getState().connected).toBe(false)
  })

  it('runQuery() in filter mode calls find with parsed filter', async () => {
    useStore.setState({
      connected: true,
      selectedDb: 'testdb',
      selectedCollection: 'users'
    })
    mockApi.find.mockResolvedValue({
      ok: true,
      data: { docs: [{ _id: '1', name: 'Alice' }], totalCount: 1 }
    })

    await useStore.getState().runQuery('{"name":"Alice"}')

    const state = useStore.getState()
    expect(state.docs).toEqual([{ _id: '1', name: 'Alice' }])
    expect(state.filter).toEqual({ name: 'Alice' })
    expect(state.skip).toBe(0)
    expect(mockApi.find).toHaveBeenCalledWith('testdb', 'users', {
      filter: { name: 'Alice' },
      skip: 0,
      limit: 20
    })
  })

  it('runQuery() in aggregate mode calls aggregate with parsed pipeline', async () => {
    useStore.setState({
      connected: true,
      selectedDb: 'testdb',
      selectedCollection: 'users',
      queryMode: 'aggregate'
    })
    mockApi.aggregate.mockResolvedValue({
      ok: true,
      data: [{ _id: null, total: 42 }]
    })

    await useStore.getState().runQuery('[{"$group":{"_id":null,"total":{"$sum":1}}}]')

    const state = useStore.getState()
    expect(state.docs).toEqual([{ _id: null, total: 42 }])
    expect(mockApi.aggregate).toHaveBeenCalledWith('testdb', 'users', [
      { $group: { _id: null, total: { $sum: 1 } } }
    ])
  })

  it('runQuery() returns error string for invalid JSON', async () => {
    useStore.setState({
      connected: true,
      selectedDb: 'testdb',
      selectedCollection: 'users'
    })

    const error = await useStore.getState().runQuery('{bad json}')

    expect(error).toBeTruthy()
    expect(typeof error).toBe('string')
    expect(mockApi.find).not.toHaveBeenCalled()
  })

  it('setQueryMode() toggles between filter and aggregate', () => {
    expect(useStore.getState().queryMode).toBe('filter')
    useStore.getState().setQueryMode('aggregate')
    expect(useStore.getState().queryMode).toBe('aggregate')
    useStore.getState().setQueryMode('filter')
    expect(useStore.getState().queryMode).toBe('filter')
  })
})
