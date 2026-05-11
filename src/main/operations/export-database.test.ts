import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportDatabaseOp } from './export-database';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { CollectionInfo, Result } from '../../shared/types';
import type { IndexSpec } from '../index-spec';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

interface SinkEntry {
  filePath: string;
  finalized: boolean;
  destroyed: boolean;
}

function makeCtx(opts: {
  folderPath?: string | null;
  listResult?: Result<CollectionInfo[]>;
  exportError?: { coll: string; error: string };
  sidecarErrorColls?: Set<string>;
  signal?: AbortSignal;
}): { ctx: OperationCtx; sinks: SinkEntry[]; sidecarWrites: { filePath: string; json: string }[] } {
  const sinks: SinkEntry[] = [];
  const sidecarWrites: { filePath: string; json: string }[] = [];
  const ctx = {
    mongo: {
      exportCollection: vi.fn(
        async (
          _a: ActiveConnection,
          _db: string,
          coll: string,
          output: Writable,
          onProgress: (n: number) => void,
          _signal: AbortSignal
        ): Promise<Result<number>> => {
          if (opts.exportError && opts.exportError.coll === coll) {
            return { ok: false, error: opts.exportError.error };
          }
          output.write(Buffer.from([1]));
          onProgress(2);
          return { ok: true, data: 2 };
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(async () => opts.listResult ?? ({ ok: true, data: [] } as Result<CollectionInfo[]>)),
      getExportableIndexes: vi.fn(
        async (_a: ActiveConnection, _db: string, coll: string): Promise<Result<IndexSpec[]>> => {
          if (opts.sidecarErrorColls?.has(coll)) return { ok: false, error: 'no idx' };
          return { ok: true, data: [] };
        }
      ),
      applyImportedIndexes: vi.fn(),
    },
    fs: {
      writeGzipSink: vi.fn((filePath: string) => {
        const entry: SinkEntry = { filePath, finalized: false, destroyed: false };
        sinks.push(entry);
        return {
          writable: new Writable({ write: (_c, _e, cb) => cb() }),
          finalize: async () => {
            entry.finalized = true;
          },
          destroy: async () => {
            entry.destroyed = true;
          },
        };
      }),
      readGunzipSource: vi.fn(),
      joinExportFilename: (d: string, b: string) => `${d}/${b}.bson.gz`,
      indexesSidecarPath: (p: string) => p.replace(/\.bson\.gz$/, '.indexes.json'),
      writeIndexesSidecar: vi.fn(async (filePath: string, json: string) => {
        sidecarWrites.push({ filePath, json });
      }),
      readIndexesSidecar: vi.fn(),
    },
    dialog: {
      pickSaveFile: vi.fn(),
      pickFolder: vi.fn(async () => (opts.folderPath === undefined ? '/tmp/dbf' : opts.folderPath)),
    },
    signal: opts.signal ?? new AbortController().signal,
    onProgress: vi.fn(),
  } as unknown as OperationCtx;
  return { ctx, sinks, sidecarWrites };
}

const colls = (names: string[]): CollectionInfo[] => names.map((name) => ({ name, type: 'collection' as const }));

describe('exportDatabaseOp', () => {
  it('kind is "export-database"; params schema validates', () => {
    expect(exportDatabaseOp.kind).toBe('export-database');
    expect(exportDatabaseOp.params.safeParse({ kind: 'export-database', db: 'd' }).success).toBe(true);
    expect(
      exportDatabaseOp.params.safeParse({ kind: 'export-database', db: 'd', collections: ['a', 'b'] }).success
    ).toBe(true);
  });

  it('dialog cancelled (folderPath=null): returns ok with exported:0, folder:null', async () => {
    const { ctx } = makeCtx({ folderPath: null });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toEqual({ kind: 'export-database', exported: 0, folder: null });
    expect(ctx.mongo.listCollections).not.toHaveBeenCalled();
  });

  it('listCollections failure: returns ok:false', async () => {
    const { ctx } = makeCtx({ listResult: { ok: false, error: 'no perms' } });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('no perms');
  });

  it('iterates all collections; reports total exported docs and folder', async () => {
    const { ctx, sinks } = makeCtx({ listResult: { ok: true, data: colls(['a', 'b', 'c']) } });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toEqual({ kind: 'export-database', exported: 6, folder: '/tmp/dbf' });
    expect(res.data.warning).toBeUndefined();
    expect(sinks.map((s) => s.finalized)).toEqual([true, true, true]);
  });

  it('filters to params.collections when provided', async () => {
    const { ctx } = makeCtx({ listResult: { ok: true, data: colls(['a', 'b', 'c']) } });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd', collections: ['a', 'c'] }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data.exported).toBe(4);
    expect(ctx.mongo.exportCollection).toHaveBeenCalledTimes(2);
  });

  it('silently ignores requested collections that do not exist', async () => {
    const { ctx } = makeCtx({ listResult: { ok: true, data: colls(['a', 'b']) } });
    const res = await exportDatabaseOp.run(
      ACTIVE,
      { kind: 'export-database', db: 'd', collections: ['a', 'missing'] },
      ctx
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data.exported).toBe(2);
    expect(ctx.mongo.exportCollection).toHaveBeenCalledTimes(1);
  });

  it('accumulates sidecar-error collection names into a single warning', async () => {
    const { ctx } = makeCtx({
      listResult: { ok: true, data: colls(['a', 'b', 'c']) },
      sidecarErrorColls: new Set(['a', 'c']),
    });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.warning).toBe('sidecar errors for: a, c');
  });

  it('data-export failure on a collection: returns ok:false (no warning swallowing)', async () => {
    const { ctx } = makeCtx({
      listResult: { ok: true, data: colls(['a', 'b']) },
      exportError: { coll: 'b', error: 'driver' },
    });
    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('driver');
  });

  it('cancelled mid-loop: returns ok:true with partial exported count and folder (registry maps to cancelled)', async () => {
    const ac = new AbortController();
    // Cancel as soon as the first collection finishes.
    const { ctx } = makeCtx({
      listResult: { ok: true, data: colls(['a', 'b', 'c']) },
      signal: ac.signal,
    });
    (ctx.mongo.exportCollection as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _a: ActiveConnection,
        _db: string,
        _coll: string,
        output: Writable,
        onProgress: (n: number) => void
      ): Promise<Result<number>> => {
        output.write(Buffer.from([1]));
        onProgress(2);
        ac.abort();
        return { ok: true, data: 2 };
      }
    );

    const res = await exportDatabaseOp.run(ACTIVE, { kind: 'export-database', db: 'd' }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data.exported).toBe(2);
    expect(res.data.data.folder).toBe('/tmp/dbf');
    expect(ctx.mongo.exportCollection).toHaveBeenCalledTimes(1);
  });
});
