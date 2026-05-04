import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import {
  createConnectionManager,
  type ConnectionManager,
  type ConnectionState,
  type ConnectionStorePort,
  type HistoryStorePort,
  type MongoClientFactoryPort,
} from './connection-manager';
import type { QueryHistoryEntry } from '../shared/types';

interface FakeClient {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  db: ReturnType<typeof vi.fn>;
}

function makeFakeClient(
  opts: {
    connectImpl?: () => Promise<void>;
    listDatabasesImpl?: () => Promise<{ databases: Array<{ name: string; sizeOnDisk?: number; empty?: boolean }> }>;
    listCollectionsImpl?: (db: string) => Array<{ name: string; type?: string }>;
    estimatedCountImpl?: (db: string, coll: string) => Promise<number>;
  } = {}
): FakeClient {
  const listDbs = opts.listDatabasesImpl ?? (async () => ({ databases: [] }));
  const listColls = opts.listCollectionsImpl ?? (() => []);
  const count = opts.estimatedCountImpl ?? (async () => 0);

  return {
    connect: vi.fn(opts.connectImpl ?? (async () => {})),
    close: vi.fn(async () => {}),
    db: vi.fn((dbName?: string) => ({
      admin: () => ({ listDatabases: listDbs }),
      listCollections: () => ({ toArray: async () => listColls(dbName ?? '') }),
      collection: (collName: string) => ({
        estimatedDocumentCount: () => count(dbName ?? '', collName),
      }),
    })),
  };
}

function makeDeps(
  overrides: {
    client?: FakeClient;
    setLastUsed?: ConnectionStorePort['setLastUsed'];
    getAll?: HistoryStorePort['getAll'];
    connectionKeyFromUri?: (uri: string) => string;
    factoryCreate?: MongoClientFactoryPort['create'];
  } = {}
): {
  deps: Parameters<typeof createConnectionManager>[0];
  client: FakeClient;
  setLastUsed: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
  clientFactory: MongoClientFactoryPort;
} {
  const client = overrides.client ?? makeFakeClient();
  const setLastUsed = vi.fn(overrides.setLastUsed ?? (() => {}));
  const getAll = vi.fn(overrides.getAll ?? (() => [] as QueryHistoryEntry[]));
  const clientFactory: MongoClientFactoryPort = {
    create: overrides.factoryCreate ?? vi.fn(() => client as unknown as MongoClient),
  };
  return {
    deps: {
      clientFactory,
      connectionStore: { setLastUsed },
      historyStore: { getAll },
      connectionKeyFromUri: overrides.connectionKeyFromUri ?? ((uri: string) => `key:${uri}`),
    },
    client,
    setLastUsed,
    getAll,
    clientFactory,
  };
}

describe('ConnectionManager', () => {
  let mgr: ConnectionManager;

  describe('happy path (single-db cluster)', () => {
    beforeEach(() => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({
          databases: [{ name: 'mydb', sizeOnDisk: 1024, empty: false }],
        }),
        listCollectionsImpl: () => [
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' },
        ],
        estimatedCountImpl: async (_db, coll) => (coll === 'users' ? 10 : 20),
      });
      const history: QueryHistoryEntry[] = [
        { id: 'h1', queryMode: 'filter', query: '{}', db: 'mydb', collection: 'users', timestamp: 1 },
      ];
      const built = makeDeps({ client, getAll: () => history });
      mgr = createConnectionManager(built.deps);
    });

    it('returns full ConnectedSession with autoSelectedDb and collections', async () => {
      const result = await mgr.connect('mongodb://localhost/');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({
        uri: 'mongodb://localhost/',
        connectionKey: 'key:mongodb://localhost/',
        databases: [{ name: 'mydb', sizeOnDisk: 1024, empty: false }],
        queryHistory: [{ id: 'h1', queryMode: 'filter', query: '{}', db: 'mydb', collection: 'users', timestamp: 1 }],
        autoSelectedDb: 'mydb',
        collections: [
          { name: 'users', type: 'collection', count: 10 },
          { name: 'orders', type: 'collection', count: 20 },
        ],
      });
    });

    it('transitions state connecting → connected', async () => {
      const states: ConnectionState[] = [];
      mgr.onStateChange((s) => states.push(s));
      await mgr.connect('mongodb://localhost/');
      expect(states.map((s) => s.status)).toEqual(['connecting', 'connected']);
      expect(states[1]).toMatchObject({
        status: 'connected',
        uri: 'mongodb://localhost/',
        connectionKey: 'key:mongodb://localhost/',
      });
    });
  });

  describe('multi-db cluster', () => {
    it('returns autoSelectedDb null and collections empty', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({
          databases: [
            { name: 'db1', sizeOnDisk: 1, empty: false },
            { name: 'db2', sizeOnDisk: 2, empty: false },
          ],
        }),
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);

      const result = await mgr.connect('mongodb://localhost/');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.autoSelectedDb).toBeNull();
      expect(result.data.collections).toEqual([]);
      expect(client.db).not.toHaveBeenCalledWith('db1');
      expect(client.db).not.toHaveBeenCalledWith('db2');
    });
  });

  describe('rollback on failure', () => {
    it('client.connect fails → state disconnected, close NOT called, setLastUsed NOT called', async () => {
      const client = makeFakeClient({
        connectImpl: async () => {
          throw new Error('refused');
        },
      });
      const built = makeDeps({ client });
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://bad/');
      expect(result).toEqual({ ok: false, error: 'refused' });
      expect(mgr.getState()).toEqual({ status: 'disconnected' });
      expect(client.close).not.toHaveBeenCalled();
      expect(built.setLastUsed).not.toHaveBeenCalled();
    });

    it('listDatabases fails → close called once, state disconnected', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => {
          throw new Error('no auth');
        },
      });
      const built = makeDeps({ client });
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://bad/');
      expect(result).toEqual({ ok: false, error: 'no auth' });
      expect(mgr.getState()).toEqual({ status: 'disconnected' });
      expect(client.close).toHaveBeenCalledTimes(1);
      expect(built.setLastUsed).not.toHaveBeenCalled();
    });

    it('listCollections fails (single-db path) → close called once, state disconnected', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'mydb' }] }),
        listCollectionsImpl: () => {
          throw new Error('boom');
        },
      });
      const built = makeDeps({ client });
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://bad/');
      expect(result.ok).toBe(false);
      expect(mgr.getState()).toEqual({ status: 'disconnected' });
      expect(client.close).toHaveBeenCalledTimes(1);
    });

    it('historyStore.getAll fails → close called once, state disconnected', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      const built = makeDeps({
        client,
        getAll: () => {
          throw new Error('disk');
        },
      });
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://bad/');
      expect(result.ok).toBe(false);
      expect(mgr.getState()).toEqual({ status: 'disconnected' });
      expect(client.close).toHaveBeenCalledTimes(1);
    });

    it('onStateChange fires connecting → disconnected on failure', async () => {
      const client = makeFakeClient({
        connectImpl: async () => {
          throw new Error('nope');
        },
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);
      const states: ConnectionState[] = [];
      mgr.onStateChange((s) => states.push(s));
      await mgr.connect('mongodb://bad/');
      expect(states.map((s) => s.status)).toEqual(['connecting', 'disconnected']);
    });
  });

  describe('connection key lifecycle', () => {
    it('getConnectionKey is null before connect, set after, null after disconnect', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      mgr = createConnectionManager(makeDeps({ client, connectionKeyFromUri: (uri) => new URL(uri).host }).deps);

      expect(mgr.getConnectionKey()).toBeNull();

      await mgr.connect('mongodb://localhost:27017/');
      expect(mgr.getConnectionKey()).toBe('localhost:27017');

      await mgr.disconnect();
      expect(mgr.getConnectionKey()).toBeNull();
      expect(mgr.getState()).toEqual({ status: 'disconnected' });
      expect(client.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireClient', () => {
    it('throws before connect', () => {
      mgr = createConnectionManager(makeDeps().deps);
      expect(() => mgr.requireClient()).toThrow('Not connected');
    });

    it('returns the client after successful connect', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);
      await mgr.connect('mongodb://localhost/');
      expect(mgr.requireClient()).toBe(client);
    });

    it('throws after disconnect', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);
      await mgr.connect('mongodb://localhost/');
      await mgr.disconnect();
      expect(() => mgr.requireClient()).toThrow('Not connected');
    });
  });

  describe('concurrent connect', () => {
    it('returns Already connecting while a connect is in flight', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const client = makeFakeClient({
        connectImpl: async () => {
          await gate;
        },
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);

      const first = mgr.connect('mongodb://a/');
      // Give the scheduler a tick so first reaches connecting state.
      await Promise.resolve();

      const second = await mgr.connect('mongodb://b/');
      expect(second).toEqual({ ok: false, error: 'Already connecting' });

      release();
      const firstResult = await first;
      expect(firstResult.ok).toBe(true);
    });
  });

  describe('ConnectOptions', () => {
    function makeSingleDbSetup(): {
      client: FakeClient;
      built: ReturnType<typeof makeDeps>;
    } {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'only' }] }),
        listCollectionsImpl: () => [{ name: 'c', type: 'collection' }],
      });
      const built = makeDeps({ client });
      return { client, built };
    }

    it('autoSelectSingleDb: false skips listCollections and leaves autoSelectedDb null', async () => {
      const { client, built } = makeSingleDbSetup();
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://localhost/', { autoSelectSingleDb: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.autoSelectedDb).toBeNull();
      expect(result.data.collections).toEqual([]);
      // db('only') would be the listCollections call; db() with no args is for admin.listDatabases.
      expect(client.db).not.toHaveBeenCalledWith('only');
    });

    it('persistAsLastUsed: false skips connectionStore.setLastUsed', async () => {
      const { built } = makeSingleDbSetup();
      mgr = createConnectionManager(built.deps);

      await mgr.connect('mongodb://localhost/', { persistAsLastUsed: false });
      expect(built.setLastUsed).not.toHaveBeenCalled();
    });

    it('loadHistory: false skips historyStore.getAll and returns empty queryHistory', async () => {
      const { built } = makeSingleDbSetup();
      mgr = createConnectionManager(built.deps);

      const result = await mgr.connect('mongodb://localhost/', { loadHistory: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.queryHistory).toEqual([]);
      expect(built.getAll).not.toHaveBeenCalled();
    });

    it('defaults: all three port calls happen when no options supplied', async () => {
      const { built } = makeSingleDbSetup();
      mgr = createConnectionManager(built.deps);

      await mgr.connect('mongodb://localhost/');
      expect(built.setLastUsed).toHaveBeenCalledWith('mongodb://localhost/');
      expect(built.getAll).toHaveBeenCalledWith('key:mongodb://localhost/');
    });
  });

  describe('onStateChange unsubscribe', () => {
    it('stops receiving events after unsubscribe', async () => {
      const client = makeFakeClient({
        listDatabasesImpl: async () => ({ databases: [{ name: 'db1' }, { name: 'db2' }] }),
      });
      mgr = createConnectionManager(makeDeps({ client }).deps);
      const states: ConnectionState[] = [];
      const unsub = mgr.onStateChange((s) => states.push(s));
      unsub();
      await mgr.connect('mongodb://localhost/');
      expect(states).toEqual([]);
    });
  });
});
