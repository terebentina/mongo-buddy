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

export interface QueryHistoryEntry {
  id: string;
  type: 'filter' | 'aggregate';
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
