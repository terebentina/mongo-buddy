import { create } from 'zustand'
import type { DbInfo, CollectionInfo, SavedConnection } from '../../shared/types'

interface StoreState {
  connected: boolean
  uri: string
  databases: DbInfo[]
  collections: CollectionInfo[]
  selectedDb: string | null
  selectedCollection: string | null
  docs: Record<string, unknown>[]
  totalCount: number
  skip: number
  limit: number
  filter: Record<string, unknown>
  error: string | null
  loading: boolean
  savedConnections: SavedConnection[]
  queryMode: 'filter' | 'aggregate'

  connect: (uri: string) => Promise<void>
  disconnect: () => Promise<void>
  selectDb: (db: string) => Promise<void>
  selectCollection: (db: string, collection: string) => Promise<void>
  fetchPage: (skip: number) => Promise<void>
  runQuery: (queryText: string) => Promise<string | null>
  setQueryMode: (mode: 'filter' | 'aggregate') => void
  insertDoc: (doc: Record<string, unknown>) => Promise<string | null>
  updateDoc: (id: string, doc: Record<string, unknown>) => Promise<string | null>
  deleteDoc: (id: string) => Promise<string | null>
  refreshDocs: () => Promise<void>
  loadSavedConnections: () => Promise<void>
  saveConnection: (name: string, uri: string) => Promise<void>
  deleteConnection: (name: string) => Promise<void>
  autoReconnect: () => Promise<void>
}

export const useStore = create<StoreState>()((set, get) => ({
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
  queryMode: 'filter',

  connect: async (uri: string) => {
    set({ loading: true, error: null })
    const result = await window.api.connect(uri)
    if (!result.ok) {
      set({ loading: false, error: result.error, connected: false })
      return
    }
    const dbResult = await window.api.listDatabases()
    if (!dbResult.ok) {
      set({ loading: false, error: dbResult.error, connected: true, uri })
      return
    }
    await window.api.setLastUsed(uri)
    set({ loading: false, connected: true, uri, databases: dbResult.data })
  },

  disconnect: async () => {
    await window.api.disconnect()
    set({
      connected: false,
      uri: '',
      databases: [],
      collections: [],
      selectedDb: null,
      selectedCollection: null,
      docs: [],
      totalCount: 0,
      skip: 0,
      filter: {},
      error: null
    })
  },

  selectDb: async (db: string) => {
    set({ loading: true, selectedDb: db, selectedCollection: null, docs: [], totalCount: 0 })
    const result = await window.api.listCollections(db)
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ loading: false, collections: result.data })
  },

  selectCollection: async (db: string, collection: string) => {
    const { limit, filter } = get()
    set({ loading: true, selectedDb: db, selectedCollection: collection, skip: 0 })
    const result = await window.api.find(db, collection, { filter, skip: 0, limit })
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ loading: false, docs: result.data.docs, totalCount: result.data.totalCount })
  },

  fetchPage: async (skip: number) => {
    const { selectedDb, selectedCollection, limit, filter } = get()
    if (!selectedDb || !selectedCollection) return
    set({ loading: true, skip })
    const result = await window.api.find(selectedDb, selectedCollection, { filter, skip, limit })
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ loading: false, docs: result.data.docs, totalCount: result.data.totalCount })
  },

  runQuery: async (queryText: string) => {
    const { selectedDb, selectedCollection, limit, queryMode } = get()
    if (!selectedDb || !selectedCollection) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(queryText)
    } catch {
      return 'Invalid JSON'
    }

    set({ loading: true, skip: 0, error: null })

    if (queryMode === 'aggregate') {
      if (!Array.isArray(parsed)) {
        set({ loading: false })
        return 'Aggregate pipeline must be a JSON array'
      }
      const result = await window.api.aggregate(selectedDb, selectedCollection, parsed as Record<string, unknown>[])
      if (!result.ok) {
        set({ loading: false, error: result.error })
        return result.error
      }
      set({ loading: false, docs: result.data, totalCount: result.data.length })
      return null
    }

    // filter mode
    const filter = parsed as Record<string, unknown>
    set({ filter })
    const result = await window.api.find(selectedDb, selectedCollection, { filter, skip: 0, limit })
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return result.error
    }
    set({ loading: false, docs: result.data.docs, totalCount: result.data.totalCount })
    return null
  },

  setQueryMode: (mode: 'filter' | 'aggregate') => {
    set({ queryMode: mode })
  },

  insertDoc: async (doc: Record<string, unknown>) => {
    const { selectedDb, selectedCollection } = get()
    if (!selectedDb || !selectedCollection) return 'No collection selected'
    const result = await window.api.insertOne(selectedDb, selectedCollection, doc)
    if (!result.ok) return result.error
    await get().refreshDocs()
    return null
  },

  updateDoc: async (id: string, doc: Record<string, unknown>) => {
    const { selectedDb, selectedCollection } = get()
    if (!selectedDb || !selectedCollection) return 'No collection selected'
    const result = await window.api.updateOne(selectedDb, selectedCollection, id, doc)
    if (!result.ok) return result.error
    await get().refreshDocs()
    return null
  },

  deleteDoc: async (id: string) => {
    const { selectedDb, selectedCollection } = get()
    if (!selectedDb || !selectedCollection) return 'No collection selected'
    const result = await window.api.deleteOne(selectedDb, selectedCollection, id)
    if (!result.ok) return result.error
    await get().refreshDocs()
    return null
  },

  refreshDocs: async () => {
    const { selectedDb, selectedCollection, skip, limit, filter } = get()
    if (!selectedDb || !selectedCollection) return
    const result = await window.api.find(selectedDb, selectedCollection, { filter, skip, limit })
    if (result.ok) {
      set({ docs: result.data.docs, totalCount: result.data.totalCount })
    }
  },

  loadSavedConnections: async () => {
    const connections = await window.api.listConnections()
    set({ savedConnections: connections })
  },

  saveConnection: async (name: string, uri: string) => {
    await window.api.saveConnection({ name, uri })
    const connections = await window.api.listConnections()
    set({ savedConnections: connections })
  },

  deleteConnection: async (name: string) => {
    await window.api.deleteConnection(name)
    const connections = await window.api.listConnections()
    set({ savedConnections: connections })
  },

  autoReconnect: async () => {
    const lastUsed = await window.api.getLastUsed()
    if (lastUsed) {
      await get().connect(lastUsed)
    }
  }
}))
