import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  FindOpts,
  FindResult,
  SavedConnection,
  QueryHistoryEntry,
  ExportProgress,
  ImportProgress,
  ImportOptions,
  ExportDbProgress,
  PickedFile,
  DistinctResult,
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
    distinct: (db: string, collection: string, field: string): Promise<Result<DistinctResult>> =>
      ipc.invoke('mongo:distinct', db, collection, field) as Promise<Result<DistinctResult>>,
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
    listConnections: (): Promise<SavedConnection[]> => ipc.invoke('connections:list') as Promise<SavedConnection[]>,
    saveConnection: (conn: SavedConnection): Promise<void> => ipc.invoke('connections:save', conn) as Promise<void>,
    deleteConnection: (name: string): Promise<void> => ipc.invoke('connections:delete', name) as Promise<void>,
    getLastUsed: (): Promise<string | null> => ipc.invoke('connections:get-last-used') as Promise<string | null>,
    setLastUsed: (uri: string): Promise<void> => ipc.invoke('connections:set-last-used', uri) as Promise<void>,
    loadHistory: (): Promise<QueryHistoryEntry[]> => ipc.invoke('history:load') as Promise<QueryHistoryEntry[]>,
    saveHistory: (entries: QueryHistoryEntry[]): Promise<void> => ipc.invoke('history:save', entries) as Promise<void>,
    clearHistory: (): Promise<void> => ipc.invoke('history:clear') as Promise<void>,
    exportCollection: (db: string, collection: string): Promise<Result<number | null>> =>
      ipc.invoke('mongo:export-collection', db, collection) as Promise<Result<number | null>>,
    cancelExport: (db: string, collection: string): Promise<Result<undefined>> =>
      ipc.invoke('mongo:cancel-export', db, collection) as Promise<Result<undefined>>,
    onExportProgress: (cb: (data: ExportProgress) => void): (() => void) => {
      const handler = (_event: unknown, data: ExportProgress): void => cb(data);
      ipc.on('export:progress', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('export:progress', handler as (event: unknown, ...args: unknown[]) => void);
    },
    exportDatabase: (db: string): Promise<Result<number | null>> =>
      ipc.invoke('mongo:export-database', db) as Promise<Result<number | null>>,
    cancelExportDatabase: (db: string): Promise<Result<undefined>> =>
      ipc.invoke('mongo:cancel-export-database', db) as Promise<Result<undefined>>,
    onExportDbProgress: (cb: (data: ExportDbProgress) => void): (() => void) => {
      const handler = (_event: unknown, data: ExportDbProgress): void => cb(data);
      ipc.on('export-db:progress', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('export-db:progress', handler as (event: unknown, ...args: unknown[]) => void);
    },
    pickImportFile: (): Promise<Result<PickedFile[] | null>> =>
      ipc.invoke('mongo:pick-import-file') as Promise<Result<PickedFile[] | null>>,
    importCollection: (
      db: string,
      collection: string,
      filePath: string,
      options: ImportOptions
    ): Promise<Result<{ inserted: number; skipped: number } | null>> =>
      ipc.invoke('mongo:import-collection', db, collection, filePath, options) as Promise<
        Result<{ inserted: number; skipped: number } | null>
      >,
    cancelImport: (db: string, collection: string): Promise<Result<undefined>> =>
      ipc.invoke('mongo:cancel-import', db, collection) as Promise<Result<undefined>>,
    onImportProgress: (cb: (data: ImportProgress) => void): (() => void) => {
      const handler = (_event: unknown, data: ImportProgress): void => cb(data);
      ipc.on('import:progress', handler as (event: unknown, ...args: unknown[]) => void);
      return () => ipc.off('import:progress', handler as (event: unknown, ...args: unknown[]) => void);
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
