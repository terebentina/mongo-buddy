import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  FindOpts,
  FindResult,
  SavedConnection,
  QueryHistoryEntry,
  ExportProgress,
} from '../shared/types';

interface MongoApi {
  connect(uri: string): Promise<Result<undefined>>;
  disconnect(): Promise<Result<undefined>>;
  listDatabases(): Promise<Result<DbInfo[]>>;
  listCollections(db: string): Promise<Result<CollectionInfo[]>>;
  find(db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>>;
  count(db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>>;
  aggregate(
    db: string,
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>[]>>;
  sampleFields(db: string, collection: string): Promise<Result<string[]>>;
  insertOne(db: string, collection: string, doc: Record<string, unknown>): Promise<Result<Record<string, unknown>>>;
  updateOne(
    db: string,
    collection: string,
    id: unknown,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>>;
  deleteOne(db: string, collection: string, id: unknown): Promise<Result<undefined>>;
  listConnections(): Promise<SavedConnection[]>;
  saveConnection(conn: SavedConnection): Promise<void>;
  deleteConnection(name: string): Promise<void>;
  getLastUsed(): Promise<string | null>;
  setLastUsed(uri: string): Promise<void>;
  loadHistory(): Promise<QueryHistoryEntry[]>;
  saveHistory(entries: QueryHistoryEntry[]): Promise<void>;
  clearHistory(): Promise<void>;
  exportCollection(db: string, collection: string): Promise<Result<number | null>>;
  cancelExport(db: string, collection: string): Promise<Result<undefined>>;
  onExportProgress(cb: (data: ExportProgress) => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: MongoApi;
  }
}
