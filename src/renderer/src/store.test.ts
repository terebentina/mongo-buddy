import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './store'

const mockApi = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
  find: vi.fn(),
  count: vi.fn()
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
    loading: false
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
})
