import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerIpcHandlers } from './ipc-handlers';
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore } from './query-history-store';
import type { ConnectionManager } from './connection-manager';

const mockShowSaveDialog = vi.fn();
const mockShowOpenDialog = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
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
vi.mock('./query-history-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./query-history-store')>();
  return { ...actual, QueryHistoryStore: vi.fn() };
});

describe('IPC Handlers', () => {
  let mockService: {
    listDatabases: ReturnType<typeof vi.fn>;
    listCollections: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    insertOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    exportCollection: ReturnType<typeof vi.fn>;
    distinct: ReturnType<typeof vi.fn>;
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
  let mockManager: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
    getConnectionKey: ReturnType<typeof vi.fn>;
    requireClient: ReturnType<typeof vi.fn>;
    onStateChange: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    mockManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getState: vi.fn(),
      getConnectionKey: vi.fn(),
      requireClient: vi.fn(),
      onStateChange: vi.fn(),
    };

    mockService = {
      listDatabases: vi.fn(),
      listCollections: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteOne: vi.fn(),
      exportCollection: vi.fn(),
      distinct: vi.fn(),
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
      mockHistoryStore as unknown as QueryHistoryStore,
      mockManager as unknown as ConnectionManager
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
    expect(handlers['mongo:export-database']).toBeDefined();
    expect(handlers['mongo:cancel-export-database']).toBeDefined();
    expect(handlers['mongo:distinct']).toBeDefined();
  });

  describe('mongo:connect', () => {
    it('calls ConnectionManager.connect with URI and returns result', async () => {
      mockManager.connect.mockResolvedValue({ ok: true, data: { uri: 'mongodb://localhost:27017' } });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017');
      expect(mockManager.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('returns error result on failure', async () => {
      mockManager.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'bad-uri');
      expect(result).toEqual({ ok: false, error: 'Connection refused' });
    });
  });

  describe('mongo:disconnect', () => {
    it('calls ConnectionManager.disconnect', async () => {
      mockManager.disconnect.mockResolvedValue({ ok: true, data: undefined });
      const result = await handlers['mongo:disconnect']({} as Electron.IpcMainInvokeEvent);
      expect(mockManager.disconnect).toHaveBeenCalled();
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

  describe('history (per-connection)', () => {
    const uri = 'mongodb://myhost:9999/testdb';
    const key = 'myhost:9999';

    beforeEach(async () => {
      mockManager.connect.mockResolvedValue({ ok: true, data: { uri } });
      await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, uri);
    });

    it('load returns entries for current connection key', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      mockHistoryStore.getAll.mockReturnValue(entries);
      const result = handlers['history:load']({} as Electron.IpcMainInvokeEvent);
      expect(mockHistoryStore.getAll).toHaveBeenCalledWith(key);
      expect(result).toEqual(entries);
    });

    it('save passes connection key to QueryHistoryStore', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      handlers['history:save']({} as Electron.IpcMainInvokeEvent, entries);
      expect(mockHistoryStore.save).toHaveBeenCalledWith(key, entries);
    });

    it('clear passes connection key to QueryHistoryStore', () => {
      handlers['history:clear']({} as Electron.IpcMainInvokeEvent);
      expect(mockHistoryStore.clear).toHaveBeenCalledWith(key);
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

  describe('mongo:export-database', () => {
    const mockEvent = {
      sender: { send: vi.fn() },
    } as unknown as Electron.IpcMainInvokeEvent;

    it('returns { ok: true, data: null } when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const result = await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(result).toEqual({ ok: true, data: null });
    });

    it('rejects if export already in progress for same database', async () => {
      let resolveListCollections: (v: { ok: true; data: { name: string; type: string }[] }) => void;
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/export'] });
      mockService.listCollections.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveListCollections = resolve;
          })
      );

      const first = handlers['mongo:export-database'](mockEvent, 'testdb') as Promise<unknown>;
      await new Promise((r) => setTimeout(r, 10));

      const result = await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(result).toEqual({ ok: false, error: 'Export already in progress for this database' });

      resolveListCollections!({ ok: true, data: [] });
      await first;
    });

    it('returns 0 when database has no collections', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/export'] });
      mockService.listCollections.mockResolvedValue({ ok: true, data: [] });

      const result = await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(result).toEqual({ ok: true, data: 0 });
    });

    it('filters out views and only exports collections', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/export'] });
      mockService.listCollections.mockResolvedValue({
        ok: true,
        data: [
          { name: 'users', type: 'collection' },
          { name: 'user_view', type: 'view' },
        ],
      });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection.mockResolvedValue({ ok: true, data: 10 });

      await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(mockService.exportCollection).toHaveBeenCalledTimes(1);
      expect(mockService.exportCollection.mock.calls[0][1]).toBe('users');
    });

    it('sends export-db:progress events with correct index/total/count', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/export'] });
      mockService.listCollections.mockResolvedValue({
        ok: true,
        data: [
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' },
        ],
      });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection.mockImplementation(
        async (_db: string, _coll: string, _output: unknown, onProgress: (n: number) => void) => {
          onProgress(50);
          return { ok: true, data: 50 };
        }
      );

      await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(mockEvent.sender.send).toHaveBeenCalledWith('export-db:progress', {
        db: 'testdb',
        collection: 'users',
        index: 0,
        total: 2,
        count: 50,
      });
      expect(mockEvent.sender.send).toHaveBeenCalledWith('export-db:progress', {
        db: 'testdb',
        collection: 'orders',
        index: 1,
        total: 2,
        count: 50,
      });
    });

    it('returns total doc count across all collections', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/export'] });
      mockService.listCollections.mockResolvedValue({
        ok: true,
        data: [
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' },
        ],
      });
      mockEnd.mockImplementation((cb: () => void) => cb());
      mockOn.mockImplementation((evt: string, cb: () => void) => {
        if (evt === 'finish') cb();
      });
      mockService.exportCollection
        .mockResolvedValueOnce({ ok: true, data: 10 })
        .mockResolvedValueOnce({ ok: true, data: 20 });

      const result = await handlers['mongo:export-database'](mockEvent, 'testdb');
      expect(result).toEqual({ ok: true, data: 30 });
    });
  });

  describe('mongo:cancel-export-database', () => {
    it('returns error when no active export', () => {
      const result = handlers['mongo:cancel-export-database']({} as Electron.IpcMainInvokeEvent, 'testdb');
      expect(result).toEqual({ ok: false, error: 'No active database export for this database' });
    });
  });

  describe('mongo:distinct', () => {
    it('calls MongoService.distinct with db, collection, and field', async () => {
      const distinctResult = { values: ['active', 'inactive'], truncated: false };
      mockService.distinct.mockResolvedValue({ ok: true, data: distinctResult });
      const result = await handlers['mongo:distinct']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', 'status');
      expect(mockService.distinct).toHaveBeenCalledWith('testdb', 'users', 'status');
      expect(result).toEqual({ ok: true, data: distinctResult });
    });

    it('returns error result on service failure', async () => {
      mockService.distinct.mockResolvedValue({ ok: false, error: 'Query failed' });
      const result = await handlers['mongo:distinct']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', 'status');
      expect(result).toEqual({ ok: false, error: 'Query failed' });
    });
  });

  describe('mongo:pick-import-file', () => {
    it('returns null when dialog is cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const result = await handlers['mongo:pick-import-file']();
      expect(result).toEqual({ ok: true, data: null });
    });

    it('returns array of PickedFile for multiple selections', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/users.bson.gz', '/tmp/orders.bson.gz'],
      });
      const result = await handlers['mongo:pick-import-file']();
      expect(result).toEqual({
        ok: true,
        data: [
          { filePath: '/tmp/users.bson.gz', suggestedName: 'users' },
          { filePath: '/tmp/orders.bson.gz', suggestedName: 'orders' },
        ],
      });
    });

    it('strips .bson.gz correctly from dotted filenames', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/my.collection.bson.gz'],
      });
      const result = await handlers['mongo:pick-import-file']();
      expect(result).toEqual({
        ok: true,
        data: [{ filePath: '/tmp/my.collection.bson.gz', suggestedName: 'my.collection' }],
      });
    });
  });
});
