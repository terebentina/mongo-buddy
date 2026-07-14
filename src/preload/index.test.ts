import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {},
}));

import { createApi } from './index';
import type { ConnectionState, ConnectedSession } from '../main/connection-manager';
import type { McpStatus } from '../shared/types';

describe('preload createApi', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let on: ReturnType<typeof vi.fn>;
  let off: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ipcRenderer: any;

  beforeEach(() => {
    invoke = vi.fn();
    on = vi.fn();
    off = vi.fn();
    ipcRenderer = { invoke, on, off };
  });

  describe('connect', () => {
    it('invokes mongo:connect with uri and forwards the ConnectedSession result', async () => {
      const session: ConnectedSession = {
        uri: 'mongodb://localhost:27017',
        connectionKey: 'key-1',
        databases: [{ name: 'db1', sizeOnDisk: 100, empty: false }],
        queryHistory: [],
        autoSelectedDb: 'db1',
        collections: [],
      };
      invoke.mockResolvedValue({ ok: true, data: session });
      const api = createApi(ipcRenderer);

      const result = await api.connect('mongodb://localhost:27017');

      expect(invoke).toHaveBeenCalledWith('mongo:connect', 'mongodb://localhost:27017', undefined);
      expect(result).toEqual({ ok: true, data: session });
    });

    it('forwards ConnectOptions to the main process', async () => {
      invoke.mockResolvedValue({ ok: false, error: 'boom' });
      const api = createApi(ipcRenderer);

      await api.connect('mongodb://localhost:27017', {
        autoSelectSingleDb: false,
        persistAsLastUsed: false,
        loadHistory: false,
      });

      expect(invoke).toHaveBeenCalledWith('mongo:connect', 'mongodb://localhost:27017', {
        autoSelectSingleDb: false,
        persistAsLastUsed: false,
        loadHistory: false,
      });
    });
  });

  describe('mongo command channels', () => {
    it('listDatabases invokes mongo:listDatabases with empty object payload', async () => {
      invoke.mockResolvedValue({ ok: true, data: [] });
      const api = createApi(ipcRenderer);
      await api.listDatabases();
      expect(invoke).toHaveBeenCalledWith('mongo:listDatabases', {});
    });

    it('sampleFields invokes mongo:sampleFields with {db, collection}', async () => {
      invoke.mockResolvedValue({ ok: true, data: [] });
      const api = createApi(ipcRenderer);
      await api.sampleFields('d', 'c');
      expect(invoke).toHaveBeenCalledWith('mongo:sampleFields', { db: 'd', collection: 'c' });
    });

    it('listCollections invokes mongo:listCollections with {db}', async () => {
      invoke.mockResolvedValue({ ok: true, data: [] });
      const api = createApi(ipcRenderer);
      await api.listCollections('d');
      expect(invoke).toHaveBeenCalledWith('mongo:listCollections', { db: 'd' });
    });

    it('listIndexes invokes mongo:listIndexes with {db, collection}', async () => {
      invoke.mockResolvedValue({ ok: true, data: [] });
      const api = createApi(ipcRenderer);
      await api.listIndexes('d', 'c');
      expect(invoke).toHaveBeenCalledWith('mongo:listIndexes', { db: 'd', collection: 'c' });
    });

    it('aggregate invokes mongo:aggregate with {db, collection, pipeline}', async () => {
      invoke.mockResolvedValue({ ok: true, data: [] });
      const api = createApi(ipcRenderer);
      const pipeline = [{ $match: { x: 1 } }];
      await api.aggregate('d', 'c', pipeline);
      expect(invoke).toHaveBeenCalledWith('mongo:aggregate', { db: 'd', collection: 'c', pipeline });
    });

    it('find invokes mongo:find with merged options object', async () => {
      invoke.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
      const api = createApi(ipcRenderer);
      await api.find('d', 'c', { filter: { x: 1 }, sort: { name: 1 }, skip: 5, limit: 20 });
      expect(invoke).toHaveBeenCalledWith('mongo:find', {
        db: 'd',
        collection: 'c',
        filter: { x: 1 },
        sort: { name: 1 },
        skip: 5,
        limit: 20,
      });
    });

    it('dropCollections invokes mongo:dropCollections with {db, names}', async () => {
      invoke.mockResolvedValue({ ok: true, data: { dropped: [], failed: [] } });
      const api = createApi(ipcRenderer);
      await api.dropCollections('d', ['a', 'b']);
      expect(invoke).toHaveBeenCalledWith('mongo:dropCollections', { db: 'd', names: ['a', 'b'] });
    });

    it('dropCollection invokes mongo:dropCollection with {db, collection}', async () => {
      invoke.mockResolvedValue({ ok: true, data: undefined });
      const api = createApi(ipcRenderer);
      await api.dropCollection('d', 'c');
      expect(invoke).toHaveBeenCalledWith('mongo:dropCollection', { db: 'd', collection: 'c' });
    });

    it('renameCollection invokes mongo:renameCollection with {db, from, to}', async () => {
      invoke.mockResolvedValue({ ok: true, data: undefined });
      const api = createApi(ipcRenderer);
      await api.renameCollection('d', 'users', 'members');
      expect(invoke).toHaveBeenCalledWith('mongo:renameCollection', { db: 'd', from: 'users', to: 'members' });
    });

    it('dropIndex invokes mongo:dropIndex with {db, collection, indexName}', async () => {
      invoke.mockResolvedValue({ ok: true, data: undefined });
      const api = createApi(ipcRenderer);
      await api.dropIndex('d', 'c', 'email_1');
      expect(invoke).toHaveBeenCalledWith('mongo:dropIndex', { db: 'd', collection: 'c', indexName: 'email_1' });
    });

    it('deleteOne invokes mongo:deleteOne with {db, collection, id}', async () => {
      invoke.mockResolvedValue({ ok: true, data: undefined });
      const api = createApi(ipcRenderer);
      await api.deleteOne('d', 'c', '123');
      expect(invoke).toHaveBeenCalledWith('mongo:deleteOne', { db: 'd', collection: 'c', id: '123' });
    });

    it('updateOne invokes mongo:updateOne with {db, collection, id, doc}', async () => {
      invoke.mockResolvedValue({ ok: true, data: {} });
      const api = createApi(ipcRenderer);
      await api.updateOne('d', 'c', '123', { name: 'Bob' });
      expect(invoke).toHaveBeenCalledWith('mongo:updateOne', {
        db: 'd',
        collection: 'c',
        id: '123',
        doc: { name: 'Bob' },
      });
    });

    it('insertOne invokes mongo:insertOne with {db, collection, doc}', async () => {
      invoke.mockResolvedValue({ ok: true, data: {} });
      const api = createApi(ipcRenderer);
      await api.insertOne('d', 'c', { name: 'Alice' });
      expect(invoke).toHaveBeenCalledWith('mongo:insertOne', { db: 'd', collection: 'c', doc: { name: 'Alice' } });
    });

    it('explain invokes mongo:explain with {db, collection, queryMode, query}', async () => {
      invoke.mockResolvedValue({ ok: true, data: {} });
      const api = createApi(ipcRenderer);
      await api.explain('d', 'c', 'filter', { name: 'Alice' });
      expect(invoke).toHaveBeenCalledWith('mongo:explain', {
        db: 'd',
        collection: 'c',
        queryMode: 'filter',
        query: { name: 'Alice' },
      });
    });

    it('distinct invokes mongo:distinct with {db, collection, field, filter}', async () => {
      invoke.mockResolvedValue({ ok: true, data: { values: [], truncated: false } });
      const api = createApi(ipcRenderer);
      await api.distinct('d', 'c', 'status', { active: true });
      expect(invoke).toHaveBeenCalledWith('mongo:distinct', {
        db: 'd',
        collection: 'c',
        field: 'status',
        filter: { active: true },
      });
    });
  });

  describe('onConnectionState', () => {
    it('registers a listener on connection:state and forwards the state payload', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      api.onConnectionState(cb);

      expect(on).toHaveBeenCalledTimes(1);
      const [channel, handler] = on.mock.calls[0];
      expect(channel).toBe('connection:state');

      const state: ConnectionState = { status: 'connecting', uri: 'mongodb://localhost' };
      (handler as (event: unknown, data: ConnectionState) => void)({}, state);

      expect(cb).toHaveBeenCalledWith(state);
    });

    it('returns an unsubscribe function that removes the exact listener via ipcRenderer.off', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      const unsubscribe = api.onConnectionState(cb);
      const registeredHandler = on.mock.calls[0][1];

      unsubscribe();

      expect(off).toHaveBeenCalledWith('connection:state', registeredHandler);
    });

    it('does not leak listeners: handler registered via on matches the one passed to off', () => {
      const api = createApi(ipcRenderer);

      const unsub1 = api.onConnectionState(vi.fn());
      const unsub2 = api.onConnectionState(vi.fn());

      const handler1 = on.mock.calls[0][1];
      const handler2 = on.mock.calls[1][1];
      expect(handler1).not.toBe(handler2);

      unsub1();
      unsub2();

      expect(off).toHaveBeenNthCalledWith(1, 'connection:state', handler1);
      expect(off).toHaveBeenNthCalledWith(2, 'connection:state', handler2);
    });
  });

  describe('getMcpStatus', () => {
    it('invokes mcp:status:get and returns the McpStatus payload', async () => {
      const status: McpStatus = { running: true, port: 27099 };
      invoke.mockResolvedValue(status);
      const api = createApi(ipcRenderer);

      const result = await api.getMcpStatus();

      expect(invoke).toHaveBeenCalledWith('mcp:status:get');
      expect(result).toEqual(status);
    });
  });

  describe('onMcpStatusUpdate', () => {
    it('registers a listener on mcp:status:update and forwards the payload', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      api.onMcpStatusUpdate(cb);

      expect(on).toHaveBeenCalledTimes(1);
      const [channel, handler] = on.mock.calls[0];
      expect(channel).toBe('mcp:status:update');

      const status: McpStatus = { running: true, port: 27099 };
      (handler as (event: unknown, data: McpStatus) => void)({}, status);

      expect(cb).toHaveBeenCalledWith(status);
    });

    it('returns an unsubscribe function that removes the exact listener via ipcRenderer.off', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      const unsubscribe = api.onMcpStatusUpdate(cb);
      const registeredHandler = on.mock.calls[0][1];

      unsubscribe();

      expect(off).toHaveBeenCalledWith('mcp:status:update', registeredHandler);
    });
  });
});
