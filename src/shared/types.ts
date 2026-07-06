export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DbInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

export interface CollectionInfo {
  name: string;
  type: string;
  count?: number;
}

export interface FindOpts {
  filter?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

export interface FindResult {
  docs: Record<string, unknown>[];
  totalCount: number;
}

export interface SavedConnection {
  name: string;
  uri: string;
}

export interface ExportProgress {
  db: string;
  collection: string;
  count: number;
}

export type QueryMode = 'filter' | 'aggregate';

export interface QueryHistoryEntry {
  id: string;
  queryMode: QueryMode;
  query: string;
  db: string;
  collection: string;
  timestamp: number;
}

export interface ImportProgress {
  db: string;
  collection: string;
  count: number;
}

export interface ImportOptions {
  onDuplicate: 'skip' | 'fail' | 'upsert';
  clearFirst: boolean;
}

export interface ExportDbProgress {
  db: string;
  collection: string;
  index: number;
  total: number;
  count: number;
}

export interface PickedFile {
  filePath: string;
  suggestedName: string;
}

export interface DistinctResult {
  values: unknown[];
  truncated: boolean;
}

export interface IndexInfo {
  name: string;
  key: Record<string, unknown>;
  [k: string]: unknown;
}

export interface DropCollectionsResult {
  dropped: string[];
  failed: { name: string; error: string }[];
}

export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting'; uri: string }
  | { status: 'connected'; uri: string; connectionKey: string }
  | { status: 'error'; uri: string; error: string };

export interface ConnectedSession {
  uri: string;
  connectionKey: string;
  databases: DbInfo[];
  queryHistory: QueryHistoryEntry[];
  autoSelectedDb: string | null;
  collections: CollectionInfo[];
}

export interface ConnectOptions {
  autoSelectSingleDb?: boolean;
  persistAsLastUsed?: boolean;
  loadHistory?: boolean;
}

export type OperationKind = 'export-collection' | 'export-database' | 'import-collection';

export type OperationId = string;

export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'rejected';

export interface OperationProgress {
  processed: number;
  total?: number;
  label?: string;
  stage?: string;
}

export type OperationParams =
  | { kind: 'export-collection'; db: string; collection: string }
  | { kind: 'export-database'; db: string; collections?: string[] }
  | {
      kind: 'import-collection';
      db: string;
      collection: string;
      filePath: string;
      options: ImportOptions;
    };

export type OperationResult =
  | { kind: 'export-collection'; exported: number; path: string | null }
  | { kind: 'export-database'; exported: number; folder: string | null }
  | { kind: 'import-collection'; inserted: number; skipped: number };

export interface OperationRecord {
  id: OperationId;
  params: OperationParams;
  status: OperationStatus;
  progress: OperationProgress;
  result?: OperationResult;
  error?: string;
  warning?: string;
}

export interface McpStatus {
  running: boolean;
  port: number | null;
}
