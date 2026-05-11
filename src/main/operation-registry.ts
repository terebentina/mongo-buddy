import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Readable, Writable } from 'stream';
import type {
  CollectionInfo,
  ImportOptions,
  OperationId,
  OperationKind,
  OperationParams,
  OperationProgress,
  OperationRecord,
  Result,
} from '../shared/types';
import type { IndexSpec } from './index-spec';
import type { ActiveConnection } from './connection-manager';
import type { AnyOperationDef, OperationCtx } from './operations/types';

export interface MongoServicePort {
  exportCollection(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    output: Writable,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<number>>;
  importCollection(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    input: Readable,
    options: ImportOptions,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<{ inserted: number; skipped: number }>>;
  listCollections(active: ActiveConnection, dbName: string): Promise<Result<CollectionInfo[]>>;
  getExportableIndexes(active: ActiveConnection, dbName: string, collName: string): Promise<Result<IndexSpec[]>>;
  applyImportedIndexes(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    specs: IndexSpec[],
    opts: { dropExisting: boolean }
  ): Promise<Result<undefined>>;
}

export interface GzipSink {
  writable: Writable;
  finalize(): Promise<void>;
  destroy(): Promise<void>;
}

export interface GunzipSource {
  readable: Readable;
  destroy(): Promise<void>;
}

export interface FilesystemSinkPort {
  writeGzipSink(filePath: string): GzipSink;
  readGunzipSource(filePath: string): GunzipSource;
  joinExportFilename(dir: string, base: string): string;
  indexesSidecarPath(dataFilePath: string): string;
  writeIndexesSidecar(filePath: string, json: string): Promise<void>;
  readIndexesSidecar(filePath: string): Promise<string | null>;
}

export interface DialogProviderPort {
  pickSaveFile(suggestedBase: string): Promise<string | null>;
  pickFolder(): Promise<string | null>;
}

export interface OperationRegistry {
  start(params: OperationParams, active: ActiveConnection): Result<OperationId>;
  cancel(id: OperationId): Result<undefined>;
  get(id: OperationId): OperationRecord | undefined;
  list(): OperationRecord[];
  subscribe(cb: (rec: OperationRecord) => void): () => void;
}

interface RegistryDeps {
  mongo: MongoServicePort;
  fs: FilesystemSinkPort;
  dialog: DialogProviderPort;
  emit: (rec: OperationRecord) => void;
  kinds: readonly AnyOperationDef[];
}

function scopeKey(params: OperationParams): string {
  switch (params.kind) {
    case 'export-collection':
      return `export-collection:${params.db}.${params.collection}`;
    case 'export-database':
      return `export-database:${params.db}`;
    case 'import-collection':
      return `import-collection:${params.db}.${params.collection}`;
  }
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}

export function createOperationRegistry(deps: RegistryDeps): OperationRegistry {
  const records = new Map<OperationId, OperationRecord>();
  const inFlight = new Map<string, { id: OperationId; ac: AbortController }>();
  const subscribers = new Set<(rec: OperationRecord) => void>();
  const byKind = new Map<OperationKind, AnyOperationDef>(deps.kinds.map((k) => [k.kind, k]));

  const fanout = (rec: OperationRecord): void => {
    deps.emit(rec);
    for (const cb of subscribers) cb(rec);
  };

  const emitUpdate = (id: OperationId, patch: Partial<OperationRecord>): void => {
    const current = records.get(id);
    if (!current) return;
    const next: OperationRecord = {
      ...current,
      ...patch,
      progress: patch.progress ?? current.progress,
    };
    records.set(id, next);
    fanout(next);
  };

  const updateProgress = (id: OperationId, patch: Partial<OperationProgress>): void => {
    const current = records.get(id);
    if (!current) return;
    const nextProgress: OperationProgress = { ...current.progress, ...patch };
    const next: OperationRecord = { ...current, progress: nextProgress };
    records.set(id, next);
    fanout(next);
  };

  const runDef = async (
    id: OperationId,
    def: AnyOperationDef,
    params: OperationParams,
    ac: AbortController,
    key: string,
    active: ActiveConnection
  ): Promise<void> => {
    emitUpdate(id, { status: 'running' });

    const ctx: OperationCtx = {
      mongo: deps.mongo,
      fs: deps.fs,
      dialog: deps.dialog,
      signal: ac.signal,
      onProgress: (patch) => updateProgress(id, patch),
    };

    // The wrapper owns try/catch; def.run bodies don't need to guard their
    // mongo calls — a thrown driver error bubbles here and gets classified.
    let res: Result<{ data: OperationRecord['result']; warning?: string }>;
    try {
      // Cast: byKind narrowing gives AnyOperationDef whose run() generic is
      // not pinned to `params.kind`. The dispatch above ensures shape match.
      const out = await (
        def.run as (
          a: ActiveConnection,
          p: OperationParams,
          c: OperationCtx
        ) => Promise<Result<{ data: OperationRecord['result']; warning?: string }>>
      )(active, params, ctx);
      res = out;
    } catch (err) {
      res = { ok: false, error: (err as Error).message };
    }

    const aborted = ac.signal.aborted;

    // Invariant: release in-flight BEFORE emitting terminal, so a subscriber
    // that re-starts the same scope on terminal doesn't hit a stale guard.
    inFlight.delete(key);

    if (res.ok) {
      emitUpdate(id, {
        status: aborted ? 'cancelled' : 'succeeded',
        result: res.data.data,
        warning: res.data.warning,
      });
    } else {
      emitUpdate(id, {
        status: aborted ? 'cancelled' : 'failed',
        error: res.error,
      });
    }
  };

  const start = (params: OperationParams, active: ActiveConnection): Result<OperationId> => {
    const def = byKind.get(params.kind);
    if (!def) {
      return { ok: false, error: `unknown operation kind: ${params.kind as string}` };
    }

    const parsed = def.params.safeParse(params);
    if (!parsed.success) {
      return { ok: false, error: `invalid params: ${formatZodError(parsed.error)}` };
    }

    const key = scopeKey(params);
    if (inFlight.has(key)) {
      return { ok: false, error: 'already running' };
    }

    const id = randomUUID();
    const ac = new AbortController();
    const rec: OperationRecord = {
      id,
      params,
      status: 'pending',
      progress: { processed: 0 },
    };
    records.set(id, rec);
    inFlight.set(key, { id, ac });
    fanout(rec);

    queueMicrotask(() => {
      void runDef(id, def, parsed.data, ac, key, active);
    });

    return { ok: true, data: id };
  };

  const cancel = (id: OperationId): Result<undefined> => {
    for (const entry of inFlight.values()) {
      if (entry.id === id) {
        entry.ac.abort();
        return { ok: true, data: undefined };
      }
    }
    return { ok: false, error: 'No active operation with that id' };
  };

  const get = (id: OperationId): OperationRecord | undefined => records.get(id);
  const list = (): OperationRecord[] => Array.from(records.values());
  const subscribe = (cb: (rec: OperationRecord) => void): (() => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  };

  return { start, cancel, get, list, subscribe };
}
