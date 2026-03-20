import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ipcMain } from 'electron'
import { registerIpcHandlers } from './ipc-handlers'
import { MongoService } from './mongo-service'
import { ConnectionStore } from './connection-store'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('./mongo-service')
vi.mock('./connection-store')

describe('IPC Handlers', () => {
  let mockService: {
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    listDatabases: ReturnType<typeof vi.fn>
    listCollections: ReturnType<typeof vi.fn>
    find: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
  let mockConnStore: {
    getAll: ReturnType<typeof vi.fn>
    save: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    getLastUsed: ReturnType<typeof vi.fn>
    setLastUsed: ReturnType<typeof vi.fn>
  }
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    mockService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      listDatabases: vi.fn(),
      listCollections: vi.fn(),
      find: vi.fn(),
      count: vi.fn()
    }

    mockConnStore = {
      getAll: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      getLastUsed: vi.fn(),
      setLastUsed: vi.fn()
    }

    handlers = {}
    vi.mocked(ipcMain.handle).mockImplementation(((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }) as typeof ipcMain.handle)

    registerIpcHandlers(mockService as unknown as MongoService, mockConnStore as unknown as ConnectionStore)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('registers all expected channels', () => {
    expect(handlers['mongo:connect']).toBeDefined()
    expect(handlers['mongo:disconnect']).toBeDefined()
    expect(handlers['mongo:list-databases']).toBeDefined()
    expect(handlers['mongo:list-collections']).toBeDefined()
    expect(handlers['mongo:find']).toBeDefined()
    expect(handlers['mongo:count']).toBeDefined()
    expect(handlers['connections:list']).toBeDefined()
    expect(handlers['connections:save']).toBeDefined()
    expect(handlers['connections:delete']).toBeDefined()
    expect(handlers['connections:get-last-used']).toBeDefined()
    expect(handlers['connections:set-last-used']).toBeDefined()
  })

  describe('mongo:connect', () => {
    it('calls MongoService.connect with URI and returns result', async () => {
      mockService.connect.mockResolvedValue({ ok: true, data: undefined })
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017')
      expect(mockService.connect).toHaveBeenCalledWith('mongodb://localhost:27017')
      expect(result).toEqual({ ok: true, data: undefined })
    })

    it('returns error result on failure', async () => {
      mockService.connect.mockResolvedValue({ ok: false, error: 'Connection refused' })
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'bad-uri')
      expect(result).toEqual({ ok: false, error: 'Connection refused' })
    })
  })

  describe('mongo:disconnect', () => {
    it('calls MongoService.disconnect', async () => {
      mockService.disconnect.mockResolvedValue({ ok: true, data: undefined })
      const result = await handlers['mongo:disconnect']({} as Electron.IpcMainInvokeEvent)
      expect(mockService.disconnect).toHaveBeenCalled()
      expect(result).toEqual({ ok: true, data: undefined })
    })
  })

  describe('mongo:list-databases', () => {
    it('calls MongoService.listDatabases and returns data', async () => {
      const dbs = [{ name: 'testdb', sizeOnDisk: 1024, empty: false }]
      mockService.listDatabases.mockResolvedValue({ ok: true, data: dbs })
      const result = await handlers['mongo:list-databases']({} as Electron.IpcMainInvokeEvent)
      expect(mockService.listDatabases).toHaveBeenCalled()
      expect(result).toEqual({ ok: true, data: dbs })
    })
  })

  describe('mongo:list-collections', () => {
    it('calls MongoService.listCollections with db name', async () => {
      const colls = [{ name: 'users', type: 'collection' }]
      mockService.listCollections.mockResolvedValue({ ok: true, data: colls })
      const result = await handlers['mongo:list-collections']({} as Electron.IpcMainInvokeEvent, 'testdb')
      expect(mockService.listCollections).toHaveBeenCalledWith('testdb')
      expect(result).toEqual({ ok: true, data: colls })
    })
  })

  describe('mongo:find', () => {
    it('calls MongoService.find with db, collection, and opts', async () => {
      const findResult = { docs: [{ _id: { $oid: '123' }, name: 'Alice' }], totalCount: 1 }
      mockService.find.mockResolvedValue({ ok: true, data: findResult })
      const opts = { filter: { name: 'Alice' }, skip: 0, limit: 20 }
      const result = await handlers['mongo:find']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', opts)
      expect(mockService.find).toHaveBeenCalledWith('testdb', 'users', opts)
      expect(result).toEqual({ ok: true, data: findResult })
    })
  })

  describe('mongo:count', () => {
    it('calls MongoService.count with db, collection, and filter', async () => {
      mockService.count.mockResolvedValue({ ok: true, data: 42 })
      const result = await handlers['mongo:count']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', { active: true })
      expect(mockService.count).toHaveBeenCalledWith('testdb', 'users', { active: true })
      expect(result).toEqual({ ok: true, data: 42 })
    })
  })

  describe('error handling', () => {
    it('catches unexpected errors and returns error result', async () => {
      mockService.listDatabases.mockRejectedValue(new Error('Unexpected crash'))
      const result = await handlers['mongo:list-databases']({} as Electron.IpcMainInvokeEvent)
      expect(result).toEqual({ ok: false, error: 'Unexpected crash' })
    })
  })

  describe('connections:list', () => {
    it('returns saved connections from ConnectionStore', () => {
      const conns = [{ name: 'Local', uri: 'mongodb://localhost:27017' }]
      mockConnStore.getAll.mockReturnValue(conns)
      const result = handlers['connections:list']({} as Electron.IpcMainInvokeEvent)
      expect(result).toEqual(conns)
    })
  })

  describe('connections:save', () => {
    it('saves a connection to ConnectionStore', () => {
      const conn = { name: 'Local', uri: 'mongodb://localhost:27017' }
      handlers['connections:save']({} as Electron.IpcMainInvokeEvent, conn)
      expect(mockConnStore.save).toHaveBeenCalledWith(conn)
    })
  })

  describe('connections:delete', () => {
    it('removes a connection by name', () => {
      handlers['connections:delete']({} as Electron.IpcMainInvokeEvent, 'Local')
      expect(mockConnStore.remove).toHaveBeenCalledWith('Local')
    })
  })

  describe('connections:get-last-used', () => {
    it('returns last used URI', () => {
      mockConnStore.getLastUsed.mockReturnValue('mongodb://localhost:27017')
      const result = handlers['connections:get-last-used']({} as Electron.IpcMainInvokeEvent)
      expect(result).toBe('mongodb://localhost:27017')
    })
  })

  describe('connections:set-last-used', () => {
    it('stores last used URI', () => {
      handlers['connections:set-last-used']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017')
      expect(mockConnStore.setLastUsed).toHaveBeenCalledWith('mongodb://localhost:27017')
    })
  })
})
