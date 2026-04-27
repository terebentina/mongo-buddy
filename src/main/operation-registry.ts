import { randomUUID } from 'crypto';
import { EJSON } from 'bson';
import type { Readable, Writable } from 'stream';
import type {
  CollectionInfo,
  ImportOptions,
  OperationId,
  OperationParams,
  OperationProgress,
  OperationRecord,
  Result,
} from '../shared/types';
import { parseAndValidateSidecar, type IndexSpec } from './index-spec';

export interface MongoServicePort {
  exportCollection(
    dbName: string,
    collName: string,
    output: Writable,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<number>>;
  importCollection(
    dbName: string,
    collName: string,
    input: Readable,
    options: ImportOptions,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<{ inserted: number; skipped: number }>>;
  listCollections(dbName: string): Promise<Result<CollectionInfo[]>>;
  getExportableIndexes(dbName: string, collName: string): Promise<Result<IndexSpec[]>>;
  applyImportedIndexes(
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
  start(params: OperationParams): Result<OperationId>;
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

export function createOperationRegistry(deps: RegistryDeps): OperationRegistry {
  const records = new Map<OperationId, OperationRecord>();
  const inFlight = new Map<string, { id: OperationId; ac: AbortController }>();
  const subscribers = new Set<(rec: OperationRecord) => void>();

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

  const runExportCollection = async (
    id: OperationId,
    params: Extract<OperationParams, { kind: 'export-collection' }>,
    ac: AbortController,
    key: string
  ): Promise<void> => {
    emitUpdate(id, { status: 'running' });

    const savePath = await deps.dialog.pickSaveFile(params.collection);
    if (savePath === null) {
      inFlight.delete(key);
      emitUpdate(id, {
        status: 'succeeded',
        result: { kind: 'export-collection', exported: 0, path: null },
      });
      return;
    }

    const sink = deps.fs.writeGzipSink(savePath);
    let failed = false;
    let errorMsg: string | undefined;
    let exported = 0;
    let cancelled = false;

    try {
      const result = await deps.mongo.exportCollection(
        params.db,
        params.collection,
        sink.writable,
        (count) => updateProgress(id, { processed: count }),
        ac.signal
      );
      if (result.ok) {
        exported = result.data;
      } else {
        failed = true;
        errorMsg = result.error;
        cancelled = ac.signal.aborted;
      }
    } catch (err) {
      failed = true;
      errorMsg = (err as Error).message;
      cancelled = ac.signal.aborted;
    }

    if (failed) {
      await sink.destroy();
    } else {
      try {
        await sink.finalize();
      } catch (err) {
        failed = true;
        errorMsg = (err as Error).message;
        await sink.destroy();
      }
    }

    // After data file is finalized, write the indexes sidecar. Failure here
    // is non-fatal: data file is valid, so we report success with a warning.
    let warning: string | undefined;
    if (!failed) {
      try {
        const indexesRes = await deps.mongo.getExportableIndexes(params.db, params.collection);
        if (!indexesRes.ok) {
          warning = `Exported data but failed to read indexes: ${indexesRes.error}`;
        } else {
          const sidecarPath = deps.fs.indexesSidecarPath(savePath);
          const json = JSON.stringify(EJSON.serialize(indexesRes.data));
          await deps.fs.writeIndexesSidecar(sidecarPath, json);
        }
      } catch (err) {
        warning = `Exported data but failed to write indexes sidecar: ${(err as Error).message}`;
      }
    }

    // Release in-flight BEFORE emitting terminal, so a subscriber that
    // re-starts on terminal doesn't hit a stale guard.
    inFlight.delete(key);

    if (failed) {
      emitUpdate(id, {
        status: cancelled ? 'cancelled' : 'failed',
        error: errorMsg,
      });
    } else {
      emitUpdate(id, {
        status: 'succeeded',
        result: { kind: 'export-collection', exported, path: savePath },
        warning,
      });
    }
  };

  const runImportCollection = async (
    id: OperationId,
    params: Extract<OperationParams, { kind: 'import-collection' }>,
    ac: AbortController,
    key: string
  ): Promise<void> => {
    emitUpdate(id, { status: 'running' });

    // Validate sidecar BEFORE any destructive data operation. A bad sidecar
    // must not cause "Clear collection first" to wipe data and then fail.
    // Cancellation is not honored during the index-apply phase below.
    let sidecarSpecs: IndexSpec[] | null = null;
    try {
      const sidecarPath = deps.fs.indexesSidecarPath(params.filePath);
      const raw = await deps.fs.readIndexesSidecar(sidecarPath);
      if (raw !== null) {
        sidecarSpecs = parseAndValidateSidecar(raw);
      }
    } catch (err) {
      inFlight.delete(key);
      emitUpdate(id, { status: 'failed', error: (err as Error).message });
      return;
    }

    const source = deps.fs.readGunzipSource(params.filePath);
    let failed = false;
    let errorMsg: string | undefined;
    let inserted = 0;
    let skipped = 0;
    let cancelled = false;

    try {
      const result = await deps.mongo.importCollection(
        params.db,
        params.collection,
        source.readable,
        params.options,
        (count) => updateProgress(id, { processed: count }),
        ac.signal
      );
      if (result.ok) {
        inserted = result.data.inserted;
        skipped = result.data.skipped;
      } else {
        failed = true;
        errorMsg = result.error;
        cancelled = ac.signal.aborted;
      }
    } catch (err) {
      failed = true;
      errorMsg = (err as Error).message;
      cancelled = ac.signal.aborted;
    }

    await source.destroy();

    if (failed) {
      inFlight.delete(key);
      emitUpdate(id, {
        status: cancelled ? 'cancelled' : 'failed',
        error: errorMsg,
      });
      return;
    }

    // Data import succeeded. Apply indexes from sidecar, or surface a warning
    // if no sidecar was present.
    let warning: string | undefined;
    if (sidecarSpecs === null) {
      warning = 'No indexes were restored (sidecar file not found).';
    } else {
      const applyRes = await deps.mongo.applyImportedIndexes(params.db, params.collection, sidecarSpecs, {
        dropExisting: params.options.clearFirst,
      });
      if (!applyRes.ok) {
        inFlight.delete(key);
        emitUpdate(id, {
          status: 'failed',
          error: `${applyRes.error} (${inserted} docs imported)`,
        });
        return;
      }
    }

    inFlight.delete(key);
    emitUpdate(id, {
      status: 'succeeded',
      result: { kind: 'import-collection', inserted, skipped },
      warning,
    });
  };

  const runExportDatabase = async (
    id: OperationId,
    params: Extract<OperationParams, { kind: 'export-database' }>,
    ac: AbortController,
    key: string
  ): Promise<void> => {
    emitUpdate(id, { status: 'running' });

    const folder = await deps.dialog.pickFolder();
    if (folder === null) {
      inFlight.delete(key);
      emitUpdate(id, {
        status: 'succeeded',
        result: { kind: 'export-database', exported: 0, folder: null },
      });
      return;
    }

    const listRes = await deps.mongo.listCollections(params.db);
    if (!listRes.ok) {
      inFlight.delete(key);
      emitUpdate(id, { status: 'failed', error: listRes.error });
      return;
    }

    const collections = listRes.data.filter((c) => c.type === 'collection');
    const total = collections.length;
    updateProgress(id, { processed: 0, total });

    let totalExported = 0;
    let failed = false;
    let errorMsg: string | undefined;
    let cancelled = false;
    const sidecarErrorCollections: string[] = [];

    for (let i = 0; i < collections.length; i++) {
      if (ac.signal.aborted) {
        cancelled = true;
        break;
      }
      const coll = collections[i];
      const filePath = deps.fs.joinExportFilename(folder, coll.name);
      const sink = deps.fs.writeGzipSink(filePath);

      updateProgress(id, {
        processed: totalExported,
        total,
        label: coll.name,
        stage: `${i + 1} of ${total}`,
      });

      let collFailed = false;
      try {
        const r = await deps.mongo.exportCollection(
          params.db,
          coll.name,
          sink.writable,
          (count) => {
            updateProgress(id, {
              processed: totalExported + count,
              total,
              label: coll.name,
              stage: `${i + 1} of ${total}`,
            });
          },
          ac.signal
        );
        if (r.ok) {
          totalExported += r.data;
        } else {
          collFailed = true;
          errorMsg = r.error;
          cancelled = ac.signal.aborted;
        }
      } catch (err) {
        collFailed = true;
        errorMsg = (err as Error).message;
        cancelled = ac.signal.aborted;
      }

      if (collFailed) {
        await sink.destroy();
        if (cancelled) break;
        failed = true;
        break;
      }

      try {
        await sink.finalize();
      } catch (err) {
        await sink.destroy();
        failed = true;
        errorMsg = (err as Error).message;
        break;
      }

      // Sidecar write is best-effort per collection. A single bad collection
      // must not abort a long DB export — accumulate the name and continue.
      try {
        const indexesRes = await deps.mongo.getExportableIndexes(params.db, coll.name);
        if (!indexesRes.ok) {
          sidecarErrorCollections.push(coll.name);
        } else {
          const sidecarPath = deps.fs.indexesSidecarPath(filePath);
          const json = JSON.stringify(EJSON.serialize(indexesRes.data));
          await deps.fs.writeIndexesSidecar(sidecarPath, json);
        }
      } catch {
        sidecarErrorCollections.push(coll.name);
      }
    }

    inFlight.delete(key);

    const warning =
      sidecarErrorCollections.length > 0 ? `sidecar errors for: ${sidecarErrorCollections.join(', ')}` : undefined;

    if (cancelled) {
      emitUpdate(id, {
        status: 'cancelled',
        result: { kind: 'export-database', exported: totalExported, folder },
        error: errorMsg,
      });
    } else if (failed) {
      emitUpdate(id, { status: 'failed', error: errorMsg });
    } else {
      emitUpdate(id, {
        status: 'succeeded',
        result: { kind: 'export-database', exported: totalExported, folder },
        warning,
      });
    }
  };

  const start = (params: OperationParams): Result<OperationId> => {
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

    // Kick off async runner without blocking start()
    queueMicrotask(() => {
      if (params.kind === 'export-collection') {
        void runExportCollection(id, params, ac, key);
      } else if (params.kind === 'import-collection') {
        void runImportCollection(id, params, ac, key);
      } else {
        void runExportDatabase(id, params, ac, key);
      }
    });

    return { ok: true, data: id };
  };

  const cancel = (id: OperationId): Result<undefined> => {
    for (const [key, entry] of inFlight) {
      if (entry.id === id) {
        entry.ac.abort();
        // let runner clean up and emit terminal; do not remove in-flight here
        void key;
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
