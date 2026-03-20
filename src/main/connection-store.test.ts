import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionStore } from './connection-store'

vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const data: Record<string, unknown> = {}
      return {
        get: vi.fn((key: string, defaultValue?: unknown) =>
          key in data ? data[key] : defaultValue
        ),
        set: vi.fn((key: string, value: unknown) => {
          data[key] = value
        }),
        delete: vi.fn((key: string) => {
          delete data[key]
        })
      }
    })
  }
})

describe('ConnectionStore', () => {
  let store: ConnectionStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new ConnectionStore()
  })

  it('creates electron-store with encryption key', async () => {
    const ElectronStore = (await import('electron-store')).default
    expect(ElectronStore).toHaveBeenCalledWith(
      expect.objectContaining({ encryptionKey: expect.any(String) })
    )
  })

  it('getAll returns empty array when no connections saved', () => {
    const result = store.getAll()
    expect(result).toEqual([])
  })

  it('save adds a connection and getAll returns it', () => {
    store.save({ name: 'Local', uri: 'mongodb://localhost:27017' })
    const result = store.getAll()
    expect(result).toEqual([{ name: 'Local', uri: 'mongodb://localhost:27017' }])
  })

  it('save overwrites connection with same name', () => {
    store.save({ name: 'Local', uri: 'mongodb://localhost:27017' })
    store.save({ name: 'Local', uri: 'mongodb://localhost:27018' })
    const result = store.getAll()
    expect(result).toEqual([{ name: 'Local', uri: 'mongodb://localhost:27018' }])
  })

  it('remove deletes a connection by name', () => {
    store.save({ name: 'Local', uri: 'mongodb://localhost:27017' })
    store.save({ name: 'Remote', uri: 'mongodb://remote:27017' })
    store.remove('Local')
    const result = store.getAll()
    expect(result).toEqual([{ name: 'Remote', uri: 'mongodb://remote:27017' }])
  })

  it('remove is a no-op if name not found', () => {
    store.save({ name: 'Local', uri: 'mongodb://localhost:27017' })
    store.remove('Nonexistent')
    expect(store.getAll()).toHaveLength(1)
  })

  it('getLastUsed returns null when none set', () => {
    expect(store.getLastUsed()).toBeNull()
  })

  it('setLastUsed stores and getLastUsed retrieves it', () => {
    store.setLastUsed('mongodb://localhost:27017')
    expect(store.getLastUsed()).toBe('mongodb://localhost:27017')
  })
})
