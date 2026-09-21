import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import type { MongoClient } from 'mongodb';
import { registerIpcHandlers } from './ipc-handlers';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore } from './query-history-store';
import type { ActiveConnection, ConnectionManager, ConnectedSession, ConnectionState } from './connection-manager';
import type { OperationRegistry } from './operation-registry';
import type { OperationParams } from '../shared/types';
import type { Broadcast } from './ipc-handlers';

const TEST_ACTIVE: ActiveConnection = {
  client: {} as unknown as MongoClient,
  key: 'localhost:27017',
};

const mockShowOpenDialog = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
  },
}));

vi.mock('./connection-store');
vi.mock('./query-history-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./query-history-store')>();
  return { ...actual, QueryHistoryStore: vi.fn() };
});

describe('IPC Handlers', () => {
  let mockConnStore: {
    getAll: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    getLastUsed: ReturnType<typeof vi.fn>;
  };
  let mockHistoryStore: {
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockManager: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getActive: ReturnType<typeof vi.fn>;
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
  };
  let handlers: Record<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    stateChangeCb = null;
    mockManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getActive: vi.fn().mockReturnValue(TEST_ACTIVE),
      onStateChange: vi.fn((cb: (s: ConnectionState) => void) => {
        stateChangeCb = cb;
        return () => {
          stateChangeCb = null;
        };
      }),
    };
    mockBroadcast = vi.fn<Broadcast>();

    mockConnStore = {
      getAll: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      getLastUsed: vi.fn(),
    };

    mockHistoryStore = {
      save: vi.fn(),
      clear: vi.fn(),
    };

    mockRegistry = {
      start: vi.fn(),
      cancel: vi.fn(),
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

  describe('mongo:connect', () => {
    const session: ConnectedSession = {
      uri: 'mongodb://localhost:27017',
      databases: [{ name: 'db1', sizeOnDisk: 1, empty: false }],
      queryHistory: [],
      autoSelectedDb: 'db1',
      collections: [],
    };

    it('delegates to ConnectionManager.connect and returns full ConnectedSession', async () => {
      mockManager.connect.mockResolvedValue({ ok: true, data: session });
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017');
      expect(mockManager.connect).toHaveBeenCalledWith('mongodb://localhost:27017');
      expect(result).toEqual({ ok: true, data: session });
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

  describe('error handling', () => {
    it('catches unexpected errors and returns error result', async () => {
      mockManager.connect.mockRejectedValue(new Error('Unexpected crash'));
      const result = await handlers['mongo:connect']({} as Electron.IpcMainInvokeEvent, 'mongodb://localhost:27017');
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

  describe('history (per-connection)', () => {
    const key = 'myhost:9999';
    const active: ActiveConnection = { client: {} as unknown as MongoClient, key };

    beforeEach(() => {
      mockManager.getActive.mockReturnValue(active);
    });

    it('save passes connection key (from manager) to QueryHistoryStore', () => {
      const entries = [{ id: '1', queryMode: 'filter', query: '{}', db: 'test', collection: 'users', timestamp: 1000 }];
      handlers['history:save']({} as Electron.IpcMainInvokeEvent, entries);
      expect(mockHistoryStore.save).toHaveBeenCalledWith(key, entries);
    });

    it('clear passes connection key (from manager) to QueryHistoryStore', () => {
      handlers['history:clear']({} as Electron.IpcMainInvokeEvent);
      expect(mockHistoryStore.clear).toHaveBeenCalledWith(key);
    });

    it('save throws when manager reports no active connection', () => {
      mockManager.getActive.mockReturnValue(null);
      expect(() => handlers['history:save']({} as Electron.IpcMainInvokeEvent, [])).toThrow('Not connected');
      expect(mockHistoryStore.save).not.toHaveBeenCalled();
    });

    it('clear throws when manager reports no active connection', () => {
      mockManager.getActive.mockReturnValue(null);
      expect(() => handlers['history:clear']({} as Electron.IpcMainInvokeEvent)).toThrow('Not connected');
      expect(mockHistoryStore.clear).not.toHaveBeenCalled();
    });
  });

  describe('connection:state broadcast', () => {
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

    it('broadcasts mcp:status:update on every status change', () => {
      mcpStatusCb!({ running: true, port: 27099 });
      mcpStatusCb!({ running: false, port: null });
      expect(mockBroadcast).toHaveBeenCalledWith('mcp:status:update', { running: true, port: 27099 });
      expect(mockBroadcast).toHaveBeenCalledWith('mcp:status:update', { running: false, port: null });
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
    it('delegates to registry.start with ActiveConnection and returns its result', () => {
      mockRegistry.start.mockReturnValue({ ok: true, data: 'op-123' });
      const params: OperationParams = { kind: 'export-collection', db: 'testdb', collection: 'users' };
      const result = handlers['operation:start']({} as Electron.IpcMainInvokeEvent, params);
      expect(mockRegistry.start).toHaveBeenCalledWith(params, TEST_ACTIVE);
      expect(result).toEqual({ ok: true, data: 'op-123' });
    });

    it('forwards registry rejection', () => {
      mockRegistry.start.mockReturnValue({ ok: false, error: 'already running' });
      const params: OperationParams = { kind: 'export-database', db: 'testdb' };
      const result = handlers['operation:start']({} as Electron.IpcMainInvokeEvent, params);
      expect(result).toEqual({ ok: false, error: 'already running' });
    });

    it('returns Not connected without calling registry when manager has no active connection', () => {
      mockManager.getActive.mockReturnValue(null);
      const params: OperationParams = { kind: 'export-collection', db: 'testdb', collection: 'users' };
      const result = handlers['operation:start']({} as Electron.IpcMainInvokeEvent, params);
      expect(result).toEqual({ ok: false, error: 'Not connected' });
      expect(mockRegistry.start).not.toHaveBeenCalled();
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
