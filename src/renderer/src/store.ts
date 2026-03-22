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
  fieldNames: string[]
  sort: Record<string, 1 | -1> | null
  pendingFilterText: string | null

  connect: (uri: string) => Promise<void>
  disconnect: () => Promise<void>
  selectDb: (db: string) => Promise<void>
  selectCollection: (db: string, collection: string) => Promise<void>
  fetchPage: (skip: number) => Promise<void>
  runQuery: (queryText: string) => Promise<string | null>
  setQueryMode: (mode: 'filter' | 'aggregate') => void
  setSort: (field: string) => void
  setLimit: (newLimit: number) => void
  insertDoc: (doc: Record<string, unknown>) => Promise<string | null>
  updateDoc: (id: string, doc: Record<string, unknown>) => Promise<string | null>
  deleteDoc: (id: string) => Promise<string | null>
  refreshDocs: () => Promise<void>
  loadSavedConnections: () => Promise<void>
  saveConnection: (name: string, uri: string) => Promise<void>
  deleteConnection: (name: string) => Promise<void>
  addFilterValue: (column: string, value: unknown) => void
  clearPendingFilterText: () => void
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
  fieldNames: [],
  sort: null,
  pendingFilterText: null,

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
      error: null,
      fieldNames: []
    })
  },

  selectDb: async (db: string) => {
    set({ loading: true, selectedDb: db, selectedCollection: null, docs: [], totalCount: 0, fieldNames: [] })
    const result = await window.api.listCollections(db)
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ loading: false, collections: result.data })
  },

  selectCollection: async (db: string, collection: string) => {
    const { limit, filter } = get()
    set({ loading: true, selectedDb: db, selectedCollection: collection, skip: 0, fieldNames: [], sort: null })
    const [result, fieldsResult] = await Promise.all([
      window.api.find(db, collection, { filter, skip: 0, limit }),
      window.api.sampleFields(db, collection)
    ])
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({
      loading: false,
      docs: result.data.docs,
      totalCount: result.data.totalCount,
      fieldNames: fieldsResult.ok ? fieldsResult.data : []
    })
  },

  fetchPage: async (skip: number) => {
    const { selectedDb, selectedCollection, limit, filter, sort } = get()
    if (!selectedDb || !selectedCollection) return
    set({ loading: true, skip })
    const result = await window.api.find(selectedDb, selectedCollection, { filter, skip, limit, sort: sort ?? undefined })
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

    set({ loading: true, skip: 0, error: null, sort: null })

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

  setSort: (field: string) => {
    const { sort } = get()
    let newSort: Record<string, 1 | -1> | null
    if (!sort || !(field in sort)) {
      newSort = { [field]: 1 }
    } else if (sort[field] === 1) {
      newSort = { [field]: -1 }
    } else {
      newSort = null
    }
    set({ sort: newSort, skip: 0 })
    get().fetchPage(0)
  },

  setLimit: (newLimit: number) => {
    set({ limit: newLimit, skip: 0 })
    get().fetchPage(0)
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
    const { selectedDb, selectedCollection, skip, limit, filter, sort } = get()
    if (!selectedDb || !selectedCollection) return
    const result = await window.api.find(selectedDb, selectedCollection, { filter, skip, limit, sort: sort ?? undefined })
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

  addFilterValue: (column: string, value: unknown) => {
    const { filter } = get()
    const newFilter = { ...filter }
    const existing = newFilter[column]

    if (existing === undefined) {
      // No filter for this column yet — exact match
      newFilter[column] = value
    } else if (
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      const keys = Object.keys(existing as Record<string, unknown>)
      if (keys.length === 1 && keys[0] === '$in') {
        // Existing $in — append and deduplicate
        const arr = (existing as Record<string, unknown>)['$in'] as unknown[]
        if (!arr.includes(value)) {
          newFilter[column] = { $in: [...arr, value] }
        }
      } else if (keys.every((k) => k.startsWith('$'))) {
        // Other $-operators like $gt — replace entirely
        newFilter[column] = value
      } else {
        // Plain object value (not an operator) — replace
        newFilter[column] = value
      }
    } else {
      // Existing plain value — merge into $in
      if (existing !== value) {
        newFilter[column] = { $in: [existing, value] }
      }
    }

    set({
      filter: newFilter,
      skip: 0,
      pendingFilterText: JSON.stringify(newFilter, null, 2)
    })
    get().fetchPage(0)
  },

  clearPendingFilterText: () => {
    set({ pendingFilterText: null })
  },

  autoReconnect: async () => {
    const lastUsed = await window.api.getLastUsed()
    if (lastUsed) {
      await get().connect(lastUsed)
    }
  }
}))
