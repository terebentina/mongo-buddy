import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerIpcHandlers } from './ipc-handlers';
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore } from './query-history-store';
import type { ConnectionManager, ConnectedSession, ConnectionState } from './connection-manager';
import type { OperationRegistry } from './operation-registry';
import type { OperationParams } from '../shared/types';
import type { Broadcast } from './ipc-handlers';

const mockShowOpenDialog = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
  },
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
    distinct: ReturnType<typeof vi.fn>;
    listIndexes: ReturnType<typeof vi.fn>;
    dropIndex: ReturnType<typeof vi.fn>;
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
  let mockBroadcast: ReturnType<typeof vi.fn<Broadcast>>;
  let stateChangeCb: ((s: ConnectionState) => void) | null;
  let mcpStatusCb: ((s: import('../shared/types').McpStatus) => void) | null;
  let mockMcpStatus: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let mockRegistry: {
    start: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    stateChangeCb = null;
    mockManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getState: vi.fn(),
      getConnectionKey: vi.fn(),
      requireClient: vi.fn(),
      onStateChange: vi.fn((cb: (s: ConnectionState) => void) => {
        stateChangeCb = cb;
        return () => {
          stateChangeCb = null;
        };
      }),
    };
    mockBroadcast = vi.fn<Broadcast>();

    mockService = {
      listDatabases: vi.fn(),
      listCollections: vi.fn(),
      find: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteOne: vi.fn(),
      distinct: vi.fn(),
      listIndexes: vi.fn(),
      dropIndex: vi.fn(),
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

    mockRegistry = {
      start: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      subscribe: vi.fn(),
    };

    mcpStatusCb = null;
    mockMcpStatus = {
      get: vi.fn(() => ({ running: false, port: null })),
      set: vi.fn(),
      subscribe: vi.fn((cb: (s: import('../shared/types').McpStatus) => void) => {
        mcpStatusCb = cb;
        return () => {
          mcpStatusCb = null;
        };
      }),
    };

    handlers = {};
    vi.mocked(ipcMain.handle).mockImplementation(((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }) as typeof ipcMain.handle);

    registerIpcHandlers({
      service: mockService as unknown as MongoService,
      connStore: mockConnStore as unknown as ConnectionStore,
      historyStore: mockHistoryStore as unknown as QueryHistoryStore,
      manager: mockManager as unknown as ConnectionManager,
      registry: mockRegistry as unknown as OperationRegistry,
      mcpStatus: mockMcpStatus as unknown as import('./mcp/status').McpStatusEmitter,
      broadcast: mockBroadcast,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers mcp:status:get channel', () => {
    expect(handlers['mcp:status:get']).toBeDefined();
  });

  it('registers all expected channels', () => {
    expect(handlers['mongo:connect']).toBeDefined();
    expect(handlers['mongo:disconnect']).toBeDefined();
    expect(handlers['mongo:list-databases']).toBeDefined();
    expect(handlers['mongo:list-collections']).toBeDefined();
    expect(handlers['mongo:list-indexes']).toBeDefined();
    expect(handlers['mongo:find']).toBeDefined();
    expect(handlers['mongo:count']).toBeDefined();
    expect(handlers['mongo:aggregate']).toBeDefined();
    expect(handlers['mongo:insert-one']).toBeDefined();
    expect(handlers['mongo:update-one']).toBeDefined();
    expect(handlers['mongo:delete-one']).toBeDefined();
    expect(handlers['mongo:drop-index']).toBeDefined();
    expect(handlers['connections:list']).toBeDefined();
    expect(handlers['connections:save']).toBeDefined();
    expect(handlers['connections:delete']).toBeDefined();
    expect(handlers['connections:get-last-used']).toBeDefined();
    expect(handlers['connections:set-last-used']).toBeDefined();
    expect(handlers['history:load']).toBeDefined();
    expect(handlers['history:save']).toBeDefined();
    expect(handlers['history:clear']).toBeDefined();
    expect(handlers['mongo:distinct']).toBeDefined();
    expect(handlers['mongo:pick-import-file']).toBeDefined();
    expect(handlers['operation:start']).toBeDefined();
    expect(handlers['operation:cancel']).toBeDefined();
  });

  it('does not register legacy export/import channels', () => {
    expect(handlers['mongo:export-collection']).toBeUndefined();
    expect(handlers['mongo:cancel-export']).toBeUndefined();
    expect(handlers['mongo:export-database']).toBeUndefined();
    expect(handlers['mongo:cancel-export-database']).toBeUndefined();
    expect(handlers['mongo:import-collection']).toBeUndefined();
    expect(handlers['mongo:cancel-import']).toBeUndefined();
  });

  describe('mongo:connect', () => {
    const session: ConnectedSession = {
      uri: 'mongodb://localhost:27017',
      connectionKey: 'localhost:27017',
      databases: [{ name: 'db1', sizeOnDisk: 1, empty: false }],
      queryHistory: [],
      autoSelectedDb: 'db1',
      collections: [],
    };

    it('delegates to ConnectionManager.connect and returns full ConnectedSession', async () => {
      mockManager.connect.mockResolvedValue({ ok: true, data: session });
      const result = await handlers['mongo:connect'](
        {} as Electron.IpcMainInvokeEvent,
        'mongodb://localhost:27017',
        undefined
      );
      expect(mockManager.connect).toHaveBeenCalledWith('mongodb://localhost:27017', undefined);
      expect(result).toEqual({ ok: true, data: session });
    });

    it('forwards ConnectOptions to manager.connect', async () => {
      mockManager.connect.mockResolvedValue({ ok: true, data: session });
      await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017', {
        loadHistory: false,
      });
      expect(mockManager.connect).toHaveBeenCalledWith('mongodb://localhost:27017', { loadHistory: false });
    });

    it('returns error result on failure', async () => {
      mockManager.connect.mockResolvedValue({ ok: false, error: 'Connection refused' });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'bad-uri', undefined);
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

  describe('mongo:list-indexes', () => {
    it('calls MongoService.listIndexes with db and collection', async () => {
      const indexes = [{ v: 2, key: { _id: 1 }, name: '_id_' }];
      mockService.listIndexes.mockResolvedValue({ ok: true, data: indexes });
      const result = await handlers['mongo:list-indexes']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users');
      expect(mockService.listIndexes).toHaveBeenCalledWith('testdb', 'users');
      expect(result).toEqual({ ok: true, data: indexes });
    });

    it('forwards service error result', async () => {
      mockService.listIndexes.mockResolvedValue({ ok: false, error: 'ns not found' });
      const result = await handlers['mongo:list-indexes']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users');
      expect(result).toEqual({ ok: false, error: 'ns not found' });
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

  describe('mongo:drop-index', () => {
    it('calls MongoService.dropIndex with db, collection, and index name', async () => {
      mockService.dropIndex.mockResolvedValue({ ok: true, data: undefined });
      const result = await handlers['mongo:drop-index'](
        {} as Electron.IpcMainInvokeEvent,
        'testdb',
        'users',
        'email_1'
      );
      expect(mockService.dropIndex).toHaveBeenCalledWith('testdb', 'users', 'email_1');
      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('forwards service error result', async () => {
      mockService.dropIndex.mockResolvedValue({ ok: false, error: 'Cannot drop the _id_ index' });
      const result = await handlers['mongo:drop-index']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', '_id_');
      expect(result).toEqual({ ok: false, error: 'Cannot drop the _id_ index' });
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
    const key = 'myhost:9999';

    beforeEach(() => {
      mockManager.getConnectionKey.mockReturnValue(key);
    });

    it('load reads connection key from manager and returns entries', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      mockHistoryStore.getAll.mockReturnValue(entries);
      const result = handlers['history:load']({} as Electron.IpcMainInvokeEvent);
      expect(mockManager.getConnectionKey).toHaveBeenCalled();
      expect(mockHistoryStore.getAll).toHaveBeenCalledWith(key);
      expect(result).toEqual(entries);
    });

    it('save passes connection key (from manager) to QueryHistoryStore', () => {
      const entries = [{ id: '1', type: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      handlers['history:save']({} as Electron.IpcMainInvokeEvent, entries);
      expect(mockHistoryStore.save).toHaveBeenCalledWith(key, entries);
    });

    it('clear passes connection key (from manager) to QueryHistoryStore', () => {
      handlers['history:clear']({} as Electron.IpcMainInvokeEvent);
      expect(mockHistoryStore.clear).toHaveBeenCalledWith(key);
    });

    it('load throws when manager reports no active connection', () => {
      mockManager.getConnectionKey.mockReturnValue(null);
      expect(() => handlers['history:load']({} as Electron.IpcMainInvokeEvent)).toThrow('Not connected');
      expect(mockHistoryStore.getAll).not.toHaveBeenCalled();
    });

    it('save throws when manager reports no active connection', () => {
      mockManager.getConnectionKey.mockReturnValue(null);
      expect(() => handlers['history:save']({} as Electron.IpcMainInvokeEvent, [])).toThrow('Not connected');
      expect(mockHistoryStore.save).not.toHaveBeenCalled();
    });

    it('clear throws when manager reports no active connection', () => {
      mockManager.getConnectionKey.mockReturnValue(null);
      expect(() => handlers['history:clear']({} as Electron.IpcMainInvokeEvent)).toThrow('Not connected');
      expect(mockHistoryStore.clear).not.toHaveBeenCalled();
    });
  });

  describe('connection:state broadcast', () => {
    it('subscribes to manager.onStateChange on registration', () => {
      expect(mockManager.onStateChange).toHaveBeenCalledTimes(1);
      expect(stateChangeCb).toBeTypeOf('function');
    });

    it('broadcasts on every state transition', () => {
      const connecting: ConnectionState = { status: 'connecting', uri: 'mongodb://x' };
      const connected: ConnectionState = { status: 'connected', uri: 'mongodb://x', connectionKey: 'x' };
      stateChangeCb!(connecting);
      stateChangeCb!(connected);
      expect(mockBroadcast).toHaveBeenNthCalledWith(1, 'connection:state', connecting);
      expect(mockBroadcast).toHaveBeenNthCalledWith(2, 'connection:state', connected);
    });
  });

  describe('mcp:status', () => {
    it('mcp:status:get returns current status from emitter', () => {
      mockMcpStatus.get.mockReturnValue({ running: true, port: 27099 });
      const result = handlers['mcp:status:get']({} as Electron.IpcMainInvokeEvent);
      expect(result).toEqual({ running: true, port: 27099 });
    });

    it('subscribes to mcpStatus.subscribe on registration', () => {
      expect(mockMcpStatus.subscribe).toHaveBeenCalledTimes(1);
      expect(mcpStatusCb).toBeTypeOf('function');
    });

    it('broadcasts mcp:status:update on every status change', () => {
      mcpStatusCb!({ running: true, port: 27099 });
      mcpStatusCb!({ running: false, port: null });
      expect(mockBroadcast).toHaveBeenCalledWith('mcp:status:update', { running: true, port: 27099 });
      expect(mockBroadcast).toHaveBeenCalledWith('mcp:status:update', { running: false, port: null });
    });
  });

  describe('mongo:distinct', () => {
    it('calls MongoService.distinct with db, collection, and field', async () => {
      const distinctResult = { values: ['active', 'inactive'], truncated: false };
      mockService.distinct.mockResolvedValue({ ok: true, data: distinctResult });
      const result = await handlers['mongo:distinct']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', 'status');
      expect(mockService.distinct).toHaveBeenCalledWith('testdb', 'users', 'status', undefined);
      expect(result).toEqual({ ok: true, data: distinctResult });
    });

    it('forwards filter to MongoService.distinct', async () => {
      const distinctResult = { values: ['active'], truncated: false };
      mockService.distinct.mockResolvedValue({ ok: true, data: distinctResult });
      await handlers['mongo:distinct']({} as Electron.IpcMainInvokeEvent, 'testdb', 'users', 'status', { age: 1 });
      expect(mockService.distinct).toHaveBeenCalledWith('testdb', 'users', 'status', { age: 1 });
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

  describe('operation:start', () => {
    it('delegates to registry.start and returns its result', () => {
      mockRegistry.start.mockReturnValue({ ok: true, data: 'op-123' });
      const params: OperationParams = { kind: 'export-collection', db: 'testdb', collection: 'users' };
      const result = handlers['operation:start']({} as Electron.IpcMainInvokeEvent, params);
      expect(mockRegistry.start).toHaveBeenCalledWith(params);
      expect(result).toEqual({ ok: true, data: 'op-123' });
    });

    it('forwards registry rejection', () => {
      mockRegistry.start.mockReturnValue({ ok: false, error: 'already running' });
      const params: OperationParams = { kind: 'export-database', db: 'testdb' };
      const result = handlers['operation:start']({} as Electron.IpcMainInvokeEvent, params);
      expect(result).toEqual({ ok: false, error: 'already running' });
    });
  });

  describe('operation:cancel', () => {
    it('delegates to registry.cancel and returns its result', () => {
      mockRegistry.cancel.mockReturnValue({ ok: true, data: undefined });
      const result = handlers['operation:cancel']({} as Electron.IpcMainInvokeEvent, 'op-123');
      expect(mockRegistry.cancel).toHaveBeenCalledWith('op-123');
      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('forwards registry rejection when no op', () => {
      mockRegistry.cancel.mockReturnValue({ ok: false, error: 'No active operation with that id' });
      const result = handlers['operation:cancel']({} as Electron.IpcMainInvokeEvent, 'bogus');
      expect(result).toEqual({ ok: false, error: 'No active operation with that id' });
    });
  });
});
