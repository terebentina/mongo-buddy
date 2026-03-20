import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Result, DbInfo, CollectionInfo, FindOpts, FindResult, SavedConnection } from '../shared/types'

const api = {
  connect: (uri: string): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:connect', uri),
  disconnect: (): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:disconnect'),
  listDatabases: (): Promise<Result<DbInfo[]>> => ipcRenderer.invoke('mongo:list-databases'),
  listCollections: (db: string): Promise<Result<CollectionInfo[]>> =>
    ipcRenderer.invoke('mongo:list-collections', db),
  find: (db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>> =>
    ipcRenderer.invoke('mongo:find', db, collection, opts),
  count: (db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>> =>
    ipcRenderer.invoke('mongo:count', db, collection, filter ?? {}),
  aggregate: (db: string, collection: string, pipeline: Record<string, unknown>[]): Promise<Result<Record<string, unknown>[]>> =>
    ipcRenderer.invoke('mongo:aggregate', db, collection, pipeline),
  insertOne: (db: string, collection: string, doc: Record<string, unknown>): Promise<Result<Record<string, unknown>>> =>
    ipcRenderer.invoke('mongo:insert-one', db, collection, doc),
  updateOne: (db: string, collection: string, id: string, doc: Record<string, unknown>): Promise<Result<Record<string, unknown>>> =>
    ipcRenderer.invoke('mongo:update-one', db, collection, id, doc),
  deleteOne: (db: string, collection: string, id: string): Promise<Result<undefined>> =>
    ipcRenderer.invoke('mongo:delete-one', db, collection, id),
  listConnections: (): Promise<SavedConnection[]> => ipcRenderer.invoke('connections:list'),
  saveConnection: (conn: SavedConnection): Promise<void> => ipcRenderer.invoke('connections:save', conn),
  deleteConnection: (name: string): Promise<void> => ipcRenderer.invoke('connections:delete', name),
  getLastUsed: (): Promise<string | null> => ipcRenderer.invoke('connections:get-last-used'),
  setLastUsed: (uri: string): Promise<void> => ipcRenderer.invoke('connections:set-last-used', uri)
}

export type MongoApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
