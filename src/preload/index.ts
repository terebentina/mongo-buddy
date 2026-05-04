import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  DropCollectionsResult,
  FindOpts,
  FindResult,
  SavedConnection,
  QueryHistoryEntry,
  PickedFile,
  DistinctResult,
  IndexInfo,
  OperationParams,
  OperationId,
  OperationRecord,
  McpStatus,
} from '../shared/types';
import type { ConnectionState, ConnectedSession, ConnectOptions } from '../main/connection-manager';

export type { ConnectionState, ConnectedSession, ConnectOptions };

type IpcLike = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
  off: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void;
};

export function createApi(ipc: IpcLike) {
  return {
    connect: (uri: string, opts?: ConnectOptions): Promise<Result<ConnectedSession>> =>
      ipc.invoke('mongo:connect', uri, opts) as Promise<Result<ConnectedSession>>,
    disconnect: (): Promise<Result<undefined>> => ipc.invoke('mongo:disconnect') as Promise<Result<undefined>>,
    onConnectionState: (cb: (state: ConnectionState) => void): (() => void) => {
      const handler = (_event: unknown, state: ConnectionState): void => cb(state);
      ipc.on('connection:state', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('connection:state', handler as (event: unknown, ...args: unknown[]) => void);
    },
    listDatabases: (): Promise<Result<DbInfo[]>> => ipc.invoke('mongo:list-databases') as Promise<Result<DbInfo[]>>,
    listCollections: (db: string): Promise<Result<CollectionInfo[]>> =>
      ipc.invoke('mongo:list-collections', db) as Promise<Result<CollectionInfo[]>>,
    listIndexes: (db: string, collection: string): Promise<Result<IndexInfo[]>> =>
      ipc.invoke('mongo:list-indexes', db, collection) as Promise<Result<IndexInfo[]>>,
    find: (db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>> =>
      ipc.invoke('mongo:find', db, collection, opts) as Promise<Result<FindResult>>,
    count: (db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>> =>
      ipc.invoke('mongo:count', db, collection, filter ?? {}) as Promise<Result<number>>,
    aggregate: (
      db: string,
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Result<Record<string, unknown>[]>> =>
      ipc.invoke('mongo:aggregate', db, collection, pipeline) as Promise<Result<Record<string, unknown>[]>>,
    sampleFields: (db: string, collection: string): Promise<Result<string[]>> =>
      ipc.invoke('mongo:sample-fields', db, collection) as Promise<Result<string[]>>,
    distinct: (
      db: string,
      collection: string,
      field: string,
      filter?: Record<string, unknown>
    ): Promise<Result<DistinctResult>> =>
      ipc.invoke('mongo:distinct', db, collection, field, filter) as Promise<Result<DistinctResult>>,
    insertOne: (
      db: string,
      collection: string,
      doc: Record<string, unknown>
    ): Promise<Result<Record<string, unknown>>> =>
      ipc.invoke('mongo:insert-one', db, collection, doc) as Promise<Result<Record<string, unknown>>>,
    updateOne: (
      db: string,
      collection: string,
      id: unknown,
      doc: Record<string, unknown>
    ): Promise<Result<Record<string, unknown>>> =>
      ipc.invoke('mongo:update-one', db, collection, id, doc) as Promise<Result<Record<string, unknown>>>,
    deleteOne: (db: string, collection: string, id: unknown): Promise<Result<undefined>> =>
      ipc.invoke('mongo:delete-one', db, collection, id) as Promise<Result<undefined>>,
    dropCollection: (db: string, collection: string): Promise<Result<undefined>> =>
      ipc.invoke('mongo:drop-collection', db, collection) as Promise<Result<undefined>>,
    dropIndex: (db: string, collection: string, name: string): Promise<Result<undefined>> =>
      ipc.invoke('mongo:drop-index', db, collection, name) as Promise<Result<undefined>>,
    dropCollections: (db: string, names: string[]): Promise<Result<DropCollectionsResult>> =>
      ipc.invoke('mongo:drop-collections', db, names) as Promise<Result<DropCollectionsResult>>,
    listConnections: (): Promise<SavedConnection[]> => ipc.invoke('connections:list') as Promise<SavedConnection[]>,
    saveConnection: (conn: SavedConnection): Promise<void> => ipc.invoke('connections:save', conn) as Promise<void>,
    deleteConnection: (name: string): Promise<void> => ipc.invoke('connections:delete', name) as Promise<void>,
    getLastUsed: (): Promise<string | null> => ipc.invoke('connections:get-last-used') as Promise<string | null>,
    setLastUsed: (uri: string): Promise<void> => ipc.invoke('connections:set-last-used', uri) as Promise<void>,
    loadHistory: (): Promise<QueryHistoryEntry[]> => ipc.invoke('history:load') as Promise<QueryHistoryEntry[]>,
    saveHistory: (entries: QueryHistoryEntry[]): Promise<void> => ipc.invoke('history:save', entries) as Promise<void>,
    clearHistory: (): Promise<void> => ipc.invoke('history:clear') as Promise<void>,
    pickImportFile: (): Promise<Result<PickedFile[] | null>> =>
      ipc.invoke('mongo:pick-import-file') as Promise<Result<PickedFile[] | null>>,
    operationStart: (params: OperationParams): Promise<Result<OperationId>> =>
      ipc.invoke('operation:start', params) as Promise<Result<OperationId>>,
    operationCancel: (id: OperationId): Promise<Result<undefined>> =>
      ipc.invoke('operation:cancel', id) as Promise<Result<undefined>>,
    onOperationUpdate: (cb: (rec: OperationRecord) => void): (() => void) => {
      const handler = (_event: unknown, rec: OperationRecord): void => cb(rec);
      ipc.on('operation:update', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('operation:update', handler as (event: unknown, ...args: unknown[]) => void);
    },
    getMcpStatus: (): Promise<McpStatus> => ipc.invoke('mcp:status:get') as Promise<McpStatus>,
    onMcpStatusUpdate: (cb: (s: McpStatus) => void): (() => void) => {
      const handler = (_event: unknown, s: McpStatus): void => cb(s);
      ipc.on('mcp:status:update', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('mcp:status:update', handler as (event: unknown, ...args: unknown[]) => void);
    },
  };
}

const api = createApi(ipcRenderer as unknown as IpcLike);

export type MongoApi = ReturnType<typeof createApi>;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else if (typeof window !== 'undefined') {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}
