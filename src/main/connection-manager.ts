import type { MongoClient } from 'mongodb';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  QueryHistoryEntry,
  ConnectionState,
  ConnectedSession,
  ConnectOptions,
} from '../shared/types';

export type { ConnectionState, ConnectedSession, ConnectOptions };

export interface ConnectionStorePort {
  setLastUsed(uri: string): void;
}

export interface HistoryStorePort {
  getAll(key: string): QueryHistoryEntry[];
}

export interface MongoClientFactoryPort {
  create(uri: string): MongoClient;
}

export interface ConnectionManager {
  connect(uri: string, opts?: ConnectOptions): Promise<Result<ConnectedSession>>;
  disconnect(): Promise<Result<undefined>>;
  getState(): ConnectionState;
  getConnectionKey(): string | null;
  requireClient(): MongoClient;
  onStateChange(cb: (s: ConnectionState) => void): () => void;
}

export interface ConnectionManagerDeps {
  clientFactory: MongoClientFactoryPort;
  connectionStore: ConnectionStorePort;
  historyStore: HistoryStorePort;
  connectionKeyFromUri: (uri: string) => string;
}

async function loadDatabases(client: MongoClient): Promise<DbInfo[]> {
  const result = await client.db().admin().listDatabases();
  return result.databases.map((db) => ({
    name: db.name,
    sizeOnDisk: db.sizeOnDisk ?? 0,
    empty: db.empty ?? false,
  }));
}

async function loadCollections(client: MongoClient, dbName: string): Promise<CollectionInfo[]> {
  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();
  return Promise.all(
    collections.map(async (c) => {
      let count: number | undefined;
      try {
        count = await db.collection(c.name).estimatedDocumentCount();
      } catch {
        // ignore count errors
      }
      return { name: c.name, type: c.type ?? 'collection', count };
    })
  );
}

export function createConnectionManager(deps: ConnectionManagerDeps): ConnectionManager {
  let state: ConnectionState = { status: 'disconnected' };
  let client: MongoClient | null = null;
  const subscribers = new Set<(s: ConnectionState) => void>();

  const setState = (next: ConnectionState): void => {
    state = next;
    for (const cb of subscribers) cb(state);
  };

  const connect = async (uri: string, opts: ConnectOptions = {}): Promise<Result<ConnectedSession>> => {
    if (state.status === 'connecting') {
      return { ok: false, error: 'Already connecting' };
    }

    const autoSelectSingleDb = opts.autoSelectSingleDb ?? true;
    const persistAsLastUsed = opts.persistAsLastUsed ?? true;
    const loadHistory = opts.loadHistory ?? true;

    setState({ status: 'connecting', uri });

    let created: MongoClient;
    try {
      created = deps.clientFactory.create(uri);
    } catch (err) {
      setState({ status: 'disconnected' });
      return { ok: false, error: (err as Error).message };
    }

    try {
      await created.connect();
    } catch (err) {
      setState({ status: 'disconnected' });
      return { ok: false, error: (err as Error).message };
    }

    try {
      const databases = await loadDatabases(created);

      let autoSelectedDb: string | null = null;
      let collections: CollectionInfo[] = [];
      if (autoSelectSingleDb && databases.length === 1) {
        autoSelectedDb = databases[0].name;
        collections = await loadCollections(created, autoSelectedDb);
      }

      const connectionKey = deps.connectionKeyFromUri(uri);
      const queryHistory = loadHistory ? deps.historyStore.getAll(connectionKey) : [];

      if (persistAsLastUsed) {
        deps.connectionStore.setLastUsed(uri);
      }

      client = created;
      setState({ status: 'connected', uri, connectionKey });

      return {
        ok: true,
        data: { uri, connectionKey, databases, queryHistory, autoSelectedDb, collections },
      };
    } catch (err) {
      try {
        await created.close();
      } catch {
        // ignore close errors during rollback
      }
      setState({ status: 'disconnected' });
      return { ok: false, error: (err as Error).message };
    }
  };

  const disconnect = async (): Promise<Result<undefined>> => {
    const c = client;
    client = null;
    setState({ status: 'disconnected' });
    if (!c) return { ok: true, data: undefined };
    try {
      await c.close();
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };

  return {
    connect,
    disconnect,
    getState: () => state,
    getConnectionKey: () => (state.status === 'connected' ? state.connectionKey : null),
    requireClient: () => {
      if (!client) throw new Error('Not connected');
      return client;
    },
    onStateChange: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
