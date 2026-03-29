import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerIpcHandlers } from './ipc-handlers';
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore } from './query-history-store';

const mockShowSaveDialog = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
  },
}));

const mockWrite = vi.fn();
const mockDestroy = vi.fn();
const mockOn = vi.fn();
const mockEnd = vi.fn();
const mockPipe = vi.fn();

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => ({
    write: mockWrite,
    destroy: mockDestroy,
    on: mockOn,
    end: vi.fn(),
  })),
}));

vi.mock('fs/promises', () => ({
  unlink: vi.fn(async () => {}),
}));

vi.mock('zlib', () => ({
  createGzip: vi.fn(() => ({
    write: mockWrite,
    destroy: mockDestroy,
    on: mockOn,
    end: mockEnd,
    pipe: mockPipe,
  })),
}));

vi.mock('./mongo-service');
vi.mock('./connection-store');
vi.mock('./query-history-store');

describe('IPC Handlers', () => {
  let mockService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    listDatabases: ReturnType<typeof vi.fn>;
    listCollections: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    insertOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    exportCollection: ReturnType<typeof vi.fn>;
  };
  let mockConnStore: {
    getAll: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getLastUsed: ReturnType<typeof vi.fn>;
    setLastUsed: ReturnType<typeof vi.fn>;
  };
  let mockHistoryStore: {
    getAll: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    mockService = {
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
      exportCollection: vi.fn(),
    };

    mockConnStore = {
      getAll: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      getLastUsed: vi.fn(),
      setLastUsed: vi.fn(),
    };

    mockHistoryStore = {
      getAll: vi.fn(),
      save: vi.fn(),
      clear: vi.fn(),
    };

    handlers = {};
    vi.mocked(ipcMain.handle).mockImplementation(((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }) as typeof ipcMain.handle);

    registerIpcHandlers(
      mockService as unknown as MongoService,
      mockConnStore as unknown as ConnectionStore,
      mockHistoryStore as unknown as QueryHistoryStore
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers all expected channels', () => {
    expect(handlers['mongo:connect']).toBeDefined();
    expect(handlers['mongo:disconnect']).toBeDefined();
    expect(handlers['mongo:list-databases']).toBeDefined();
    expect(handlers['mongo:list-collections']).toBeDefined();
    expect(handlers['mongo:find']).toBeDefined();
    expect(handlers['mongo:count']).toBeDefined();
    expect(handlers['mongo:aggregate']).toBeDefined();
    expect(handlers['mongo:insert-one']).toBeDefined();
    expect(handlers['mongo:update-one']).toBeDefined();
    expect(handlers['mongo:delete-one']).toBeDefined();
    expect(handlers['connections:list']).toBeDefined();
    expect(handlers['connections:save']).toBeDefined();
    expect(handlers['connections:delete']).toBeDefined();
    expect(handlers['connections:get-last-used']).toBeDefined();
    expect(handlers['connections:set-last-used']).toBeDefined();
    expect(handlers['history:load']).toBeDefined();
    expect(handlers['history:save']).toBeDefined();
    expect(handlers['history:clear']).toBeDefined();
    expect(handlers['mongo:export-collection']).toBeDefined();
    expect(handlers['mongo:cancel-export']).toBeDefined();
  });

  describe('mongo:connect', () => {
    it('calls MongoService.connect with URI and returns result', async () => {
      mockService.connect.mockResolvedValue({ ok: true, data: undefined });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017');
      expect(mockService.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('returns error result on failure', async () => {
      mockService.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'bad-uri');
      expect(result).toEqual({ ok: false, error: 'Connection refused' });
    });
  });

  describe('mongo:disconnect', () => {
    it('calls MongoService.disconnect', async () => {
      mockService.disconnect.mockResolvedValue({ ok: true, data: undefined });
      const result = await handlers['mongo:disconnect']({} as Electron.IpcMainInvokeEvent);
      expect(mockService.disconnect).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, data: undefined });
    });
  });

  describe('mongo:list-databases', () => {
    it('calls MongoService.listDatabases and returns data', async () => {
      const dbs = [{ name: 'testdb', sizeOnDisk: 1024, empty: false }];
      mockService.listDatabases.mockResolvedValue({ ok: true, data: dbs });
      const result = await handlers['mongo:list-databases']({} as Electron.IpcMainInvokeEvent);
      expect(mockService.listDatabases).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, data: dbs });
    });
  });

  describe('mongo:list-collections', () => {
    it('calls MongoService.listCollections with db name', async () => {
      const colls = [{ name: 'users', type: 'collection' }];
      mockService.listCollections.mockResolvedValue({ ok: true, data: colls });
      const result = await handlers['mongo:list-collections']({} as Electron.IpcMainInvokeEvent, 'testdb');
      expect(mockService.listCollections).toHaveBeenCalledWith('testdb');
      expect(result).toEqual({ ok: true, data: colls });
    });
  });

  describe('mongo:find', () => {
    it('calls MongoService.find with db, collection, and opts', async () => {
      const findResult = { docs: [{ _id: { $oid: '123' }, name: 'Alice' }], totalCount: 1 };
      mockService.find.mockResolvedValue({ ok: true, data: findResult });
      const opts = { filter: { name: 'Alice' }, skip: 0, limit: 20 };
      const result = await handlers['mongo:find']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', opts);
      expect(mockService.find).toHaveBeenCalledWith('testdb', 'users', opts);
      expect(result).toEqual({ ok: true, data: findResult });
    });
  });

  describe('mongo:count', () => {
    it('calls MongoService.count with db, collection, and filter', async () => {
      mockService.count.mockResolvedValue({ ok: true, data: 42 });
      const result = await handlers['mongo:count']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', {
        active: true,
      });
      expect(mockService.count).toHaveBeenCalledWith('testdb', 'users', { active: true });
      expect(result).toEqual({ ok: true, data: 42 });
    });
  });

  describe('mongo:aggregate', () => {
    it('calls MongoService.aggregate with db, collection, and pipeline', async () => {
      const aggResult = [{ _id: null, total: 42 }];
      mockService.aggregate.mockResolvedValue({ ok: true, data: aggResult });
      const pipeline = [{ $group: { _id: null, total: { $sum: 1 } } }];
      const result = await handlers['mongo:aggregate']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', pipeline);
      expect(mockService.aggregate).toHaveBeenCalledWith('testdb', 'users', pipeline);
      expect(result).toEqual({ ok: true, data: aggResult });
    });
  });

  describe('mongo:insert-one', () => {
    it('calls MongoService.insertOne with db, collection, and doc', async () => {
      const doc = { name: 'Alice' };
      const inserted = { _id: { $oid: '123' }, name: 'Alice' };
      mockService.insertOne.mockResolvedValue({ ok: true, data: inserted });
      const result = await handlers['mongo:insert-one']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', doc);
      expect(mockService.insertOne).toHaveBeenCalledWith('testdb', 'users', doc);
      expect(result).toEqual({ ok: true, data: inserted });
    });
  });

  describe('mongo:update-one', () => {
    it('calls MongoService.updateOne with db, collection, id, and doc', async () => {
      const doc = { name: 'Bob' };
      const updated = { _id: { $oid: '123' }, name: 'Bob' };
      mockService.updateOne.mockResolvedValue({ ok: true, data: updated });
      const result = await handlers['mongo:update-one'](
        {} as Electron.IpcMainInvokeEvent,
        'testdb',
        'users',
        '123',
        doc
      );
      expect(mockService.updateOne).toHaveBeenCalledWith('testdb', 'users', '123', doc);
      expect(result).toEqual({ ok: true, data: updated });
    });
  });

  describe('mongo:delete-one', () => {
    it('calls MongoService.deleteOne with db, collection, and id', async () => {
      mockService.deleteOne.mockResolvedValue({ ok: true, data: undefined });
      const result = await handlers['mongo:delete-one']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', '123');
      expect(mockService.deleteOne).toHaveBeenCalledWith('testdb', 'users', '123');
      expect(result).toEqual({ ok: true, data: undefined });
    });
  });

  describe('error handling', () => {
    it('catches unexpected errors and returns error result', async () => {
      mockService.listDatabases.mockRejectedValue(new Error('Unexpected crash'));
      const result = await handlers['mongo:list-databases']({} as Electron.IpcMainInvokeEvent);
      expect(result).toEqual({ ok: false, error: 'Unexpected crash' });
    });
  });

  describe('connections:list', () => {
    it('returns saved connections from ConnectionStore', () => {
      const conns = [{ name: 'Local', uri: 'mongodb://localhost:27017' }];
      mockConnStore.getAll.mockReturnValue(conns);
      const result = handlers['connections:list']({} as Electron.IpcMainInvokeEvent);
      expect(result).toEqual(conns);
    });
  });

  describe('connections:save', () => {
    it('saves a connection to ConnectionStore', () => {
      const conn = { name: 'Local', uri: 'mongodb://localhost:27017' };
      handlers['connections:save']({} as Electron.IpcMainInvokeEvent, conn);
      expect(mockConnStore.save).toHaveBeenCalledWith(conn);
    });
  });

  describe('connections:delete', () => {
    it('removes a connection by name', () => {
      handlers['connections:delete']({} as Electron.IpcMainInvokeEvent, 'Local');
      expect(mockConnStore.remove).toHaveBeenCalledWith('Local');
    });
  });

  describe('connections:get-last-used', () => {
    it('returns last used URI', () => {
      mockConnStore.getLastUsed.mockReturnValue('mongodb://localhost:27017');
      const result = handlers['connections:get-last-used']({} as Electron.IpcMainInvokeEvent);
      expect(result).toBe('mongodb://localhost:27017');
    });
  });

  describe('connections:set-last-used', () => {
    it('stores last used URI', () => {
      handlers['connections:set-last-used']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017');
      expect(mockConnStore.setLastUsed).toHaveBeenCalledWith('mongodb://localhost:27017');
    });
  });

  describe('history:load', () => {
    it('returns entries from QueryHistoryStore', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      mockHistoryStore.getAll.mockReturnValue(entries);
      const result = handlers['history:load']({} as Electron.IpcMainInvokeEvent);
      expect(result).toEqual(entries);
    });
  });

  describe('history:save', () => {
    it('saves entries to QueryHistoryStore', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      handlers['history:save']({} as Electron.IpcMainInvokeEvent, entries);
      expect(mockHistoryStore.save).toHaveBeenCalledWith(entries);
    });
  });

  describe('history:clear', () => {
    it('clears QueryHistoryStore', () => {
      handlers['history:clear']({} as Electron.IpcMainInvokeEvent);
      expect(mockHistoryStore.clear).toHaveBeenCalled();
    });
  });

  describe('mongo:export-collection', () => {
    const mockEvent = {
      sender: { send: vi.fn() },
    } as unknown as Electron.IpcMainInvokeEvent;

    it('returns { ok: true, data: null } when dialog is cancelled', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
      const result = await handlers['mongo:export-collection'](mockEvent, 'testdb', 'users');
      expect(result).toEqual({ ok: true, data: null });
    });

    it('rejects if export already in progress for same collection', async () => {
      let resolveExport: (v: { ok: true; data: number }) => void;
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/test.bson.gz' });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveExport = resolve;
          })
      );

      // Start first export (don't await — it blocks on exportCollection)
      const first = handlers['mongo:export-collection'](mockEvent, 'testdb', 'users') as Promise<unknown>;
      // Flush microtasks so first export reaches exportCollection and sets the key
      await new Promise((r) => setTimeout(r, 10));

      // Second attempt should fail immediately
      const result = await handlers['mongo:export-collection'](mockEvent, 'testdb', 'users');
      expect(result).toEqual({ ok: false, error: 'Export already in progress for this collection' });

      // Resolve first export so test can finish
      resolveExport!({ ok: true, data: 5 });
      await first;
    });

    it('sends progress events to renderer', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/test.bson.gz' });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection.mockImplementation(
        async (_db: string, _coll: string, _output: unknown, onProgress: (n: number) => void) => {
          onProgress(50);
          onProgress(100);
          return { ok: true, data: 100 };
        }
      );

      await handlers['mongo:export-collection'](mockEvent, 'testdb', 'users');
      expect(mockEvent.sender.send).toHaveBeenCalledWith('export:progress', {
        db: 'testdb',
        collection: 'users',
        count: 50,
      });
      expect(mockEvent.sender.send).toHaveBeenCalledWith('export:progress', {
        db: 'testdb',
        collection: 'users',
        count: 100,
      });
    });

    it('returns doc count on successful export', async () => {
      mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/test.bson.gz' });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection.mockResolvedValue({ ok: true, data: 42 });

      const result = await handlers['mongo:export-collection'](mockEvent, 'testdb', 'users');
      expect(result).toEqual({ ok: true, data: 42 });
    });
  });

  describe('mongo:cancel-export', () => {
    it('returns error when no active export', () => {
      const result = handlers['mongo:cancel-export']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users');
      expect(result).toEqual({ ok: false, error: 'No active export for this collection' });
    });
  });
});
