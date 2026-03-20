import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Result, DbInfo, CollectionInfo, FindOpts, FindResult } from '../shared/types'

const api = {
  connect: (uri: string): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:connect', uri),
  disconnect: (): Promise<Result<undefined>> => ipcRenderer.invoke('mongo:disconnect'),
  listDatabases: (): Promise<Result<DbInfo[]>> => ipcRenderer.invoke('mongo:list-databases'),
  listCollections: (db: string): Promise<Result<CollectionInfo[]>> =>
    ipcRenderer.invoke('mongo:list-collections', db),
  find: (db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>> =>
    ipcRenderer.invoke('mongo:find', db, collection, opts),
  count: (db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>> =>
    ipcRenderer.invoke('mongo:count', db, collection, filter ?? {})
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
