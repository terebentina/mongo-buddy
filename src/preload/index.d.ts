import { ElectronAPI } from '@electron-toolkit/preload'
import type { Result, DbInfo, CollectionInfo, FindOpts, FindResult } from '../shared/types'

interface MongoApi {
  connect(uri: string): Promise<Result<undefined>>
  disconnect(): Promise<Result<undefined>>
  listDatabases(): Promise<Result<DbInfo[]>>
  listCollections(db: string): Promise<Result<CollectionInfo[]>>
  find(db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>>
  count(db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MongoApi
  }
}
