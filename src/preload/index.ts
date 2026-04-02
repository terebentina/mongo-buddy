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
  PickedFile,
} from '../shared/types';

const api = {
  connect: (uri: string): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:connect', uri),
  disconnect: (): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:disconnect'),
  listDatabases: (): Promise<Result<DbInfo[]>> => ipcRenderer.invoke('mongo:list-databases'),
  listCollections: (db: string): Promise<Result<CollectionInfo[]>> => ipcRenderer.invoke('mongo:list-collections', db),
  find: (db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>> =>
    ipcRenderer.invoke('mongo:find', db, collection, opts),
  count: (db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>> =>
    ipcRenderer.invoke('mongo:count', db, collection, filter ?? {}),
  aggregate: (
    db: string,
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>[]>> => ipcRenderer.invoke('mongo:aggregate', db, collection, pipeline),
  sampleFields: (db: string, collection: string): Promise<Result<string[]>> =>
    ipcRenderer.invoke('mongo:sample-fields', db, collection),
  insertOne: (db: string, collection: string, doc: Record<string, unknown>): Promise<Result<Record<string, unknown>>> =>
    ipcRenderer.invoke('mongo:insert-one', db, collection, doc),
  updateOne: (
    db: string,
    collection: string,
    id: unknown,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>> => ipcRenderer.invoke('mongo:update-one', db, collection, id, doc),
  deleteOne: (db: string, collection: string, id: unknown): Promise<Result<undefined>> =>
    ipcRenderer.invoke('mongo:delete-one', db, collection, id),
  dropCollection: (db: string, collection: string): Promise<Result<undefined>> =>
    ipcRenderer.invoke('mongo:drop-collection', db, collection),
  listConnections: (): Promise<SavedConnection[]> => ipcRenderer.invoke('connections:list'),
  saveConnection: (conn: SavedConnection): Promise<void> => ipcRenderer.invoke('connections:save', conn),
  deleteConnection: (name: string): Promise<void> => ipcRenderer.invoke('connections:delete', name),
  getLastUsed: (): Promise<string | null> => ipcRenderer.invoke('connections:get-last-used'),
  setLastUsed: (uri: string): Promise<void> => ipcRenderer.invoke('connections:set-last-used', uri),
  loadHistory: (): Promise<QueryHistoryEntry[]> => ipcRenderer.invoke('history:load'),
  saveHistory: (entries: QueryHistoryEntry[]): Promise<void> => ipcRenderer.invoke('history:save', entries),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('history:clear'),
  exportCollection: (db: string, collection: string): Promise<Result<number | null>> =>
    ipcRenderer.invoke('mongo:export-collection', db, collection),
  cancelExport: (db: string, collection: string): Promise<Result<undefined>> =>
    ipcRenderer.invoke('mongo:cancel-export', db, collection),
  onExportProgress: (cb: (data: ExportProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ExportProgress): void => cb(data);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.off('export:progress', handler);
  },
  pickImportFile: (): Promise<Result<PickedFile[] | null>> => ipcRenderer.invoke('mongo:pick-import-file'),
  importCollection: (
    db: string,
    collection: string,
    filePath: string,
    options: ImportOptions
  ): Promise<Result<{ inserted: number; skipped: number } | null>> =>
    ipcRenderer.invoke('mongo:import-collection', db, collection, filePath, options),
  cancelImport: (db: string, collection: string): Promise<Result<undefined>> =>
    ipcRenderer.invoke('mongo:cancel-import', db, collection),
  onImportProgress: (cb: (data: ImportProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ImportProgress): void => cb(data);
    ipcRenderer.on('import:progress', handler);
    return () => ipcRenderer.off('import:progress', handler);
  },
};

export type MongoApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI;
  // @ts-expect-error (define in dts)
  window.api = api;
}
