import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  DropCollectionsResult,
  FindOpts,
  FindResult,
  UpdateManyInput,
  UpdateManyResult,
  SavedConnection,
  QueryHistoryEntry,
  PickedFile,
  DistinctResult,
  IndexInfo,
  OperationKind,
  OperationStatus,
  OperationId,
  OperationParams,
  OperationResult,
  OperationRecord,
  OperationProgress,
  McpStatus,
  QueryMode,
} from '../shared/types';
import type { ConnectionState, ConnectedSession, ConnectOptions } from '../main/connection-manager';

export type { ConnectionState, ConnectedSession, ConnectOptions };

export type {
  OperationKind,
  OperationStatus,
  OperationId,
  OperationParams,
  OperationResult,
  OperationRecord,
  OperationProgress,
};

interface MongoApi {
  connect(uri: string, opts?: ConnectOptions): Promise<Result<ConnectedSession>>;
  disconnect(): Promise<Result<undefined>>;
  onConnectionState(cb: (state: ConnectionState) => void): () => void;
  listDatabases(): Promise<Result<DbInfo[]>>;
  listCollections(db: string): Promise<Result<CollectionInfo[]>>;
  listIndexes(db: string, collection: string): Promise<Result<IndexInfo[]>>;
  find(db: string, collection: string, opts: FindOpts): Promise<Result<FindResult>>;
  count(db: string, collection: string, filter?: Record<string, unknown>): Promise<Result<number>>;
  aggregate(
    db: string,
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>[]>>;
  explain(
    db: string,
    collection: string,
    queryMode: QueryMode,
    query: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>>>;
  sampleFields(db: string, collection: string): Promise<Result<string[]>>;
  distinct(
    db: string,
    collection: string,
    field: string,
    filter?: Record<string, unknown>
  ): Promise<Result<DistinctResult>>;
  insertOne(db: string, collection: string, doc: Record<string, unknown>): Promise<Result<Record<string, unknown>>>;
  updateOne(
    db: string,
    collection: string,
    id: unknown,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>>;
  updateMany(
    db: string,
    collection: string,
    filter: Record<string, unknown>,
    update: UpdateManyInput
  ): Promise<Result<UpdateManyResult>>;
  deleteMany(db: string, collection: string, filter: Record<string, unknown>): Promise<Result<number>>;
  deleteOne(db: string, collection: string, id: unknown): Promise<Result<undefined>>;
  createCollection(db: string, collection: string): Promise<Result<undefined>>;
  dropCollection(db: string, collection: string): Promise<Result<undefined>>;
  emptyCollection(db: string, collection: string): Promise<Result<number>>;
  renameCollection(db: string, from: string, to: string): Promise<Result<undefined>>;
  dropCollections(db: string, names: string[]): Promise<Result<DropCollectionsResult>>;
  createIndex(
    db: string,
    collection: string,
    key: Record<string, string | number>,
    options: { name?: string; unique: boolean }
  ): Promise<Result<string>>;
  dropIndex(db: string, collection: string, name: string): Promise<Result<undefined>>;
  listConnections(): Promise<SavedConnection[]>;
  saveConnection(conn: SavedConnection): Promise<void>;
  deleteConnection(name: string): Promise<void>;
  getLastUsed(): Promise<string | null>;
  setLastUsed(uri: string): Promise<void>;
  loadHistory(): Promise<QueryHistoryEntry[]>;
  saveHistory(entries: QueryHistoryEntry[]): Promise<void>;
  clearHistory(): Promise<void>;
  pickImportFile(): Promise<Result<PickedFile[] | null>>;
  operationStart(params: OperationParams): Promise<Result<OperationId>>;
  operationCancel(id: OperationId): Promise<Result<undefined>>;
  onOperationUpdate(cb: (rec: OperationRecord) => void): () => void;
  getMcpStatus(): Promise<McpStatus>;
  onMcpStatusUpdate(cb: (status: McpStatus) => void): () => void;
  setWindowTitle(arg: { location: string | null }): Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: MongoApi;
  }
}
