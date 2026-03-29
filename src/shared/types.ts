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
