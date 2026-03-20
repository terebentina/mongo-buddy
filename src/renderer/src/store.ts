import { create } from 'zustand'
import type { DbInfo, CollectionInfo } from '../../shared/types'

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

  connect: (uri: string) => Promise<void>
  disconnect: () => Promise<void>
  selectDb: (db: string) => Promise<void>
  selectCollection: (db: string, collection: string) => Promise<void>
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
  }
}))
