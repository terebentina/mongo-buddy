import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportDatabaseOp } from './export-database';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { CollectionInfo, Result } from '../../shared/types';
import type { IndexSpec } from '../index-spec';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

function makeCtx(opts: { folderPath?: string | null; listResult?: Result<CollectionInfo[]>; signal?: AbortSignal }): {
  ctx: OperationCtx;
} {
  const ctx = {
    mongo: {
      exportCollection: vi.fn(
        async (
          _a: ActiveConnection,
          _db: string,
          _coll: string,
          output: Writable,
          onProgress: (n: number) => void,
          _signal: AbortSignal
        ): Promise<Result<number>> => {
          output.write(Buffer.from([1]));
          onProgress(2);
          return { ok: true, data: 2 };
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(async () => opts.listResult ?? ({ ok: true, data: [] } as Result<CollectionInfo[]>)),
      getExportableIndexes: vi.fn(async (): Promise<Result<IndexSpec[]>> => ({ ok: true, data: [] })),
      applyImportedIndexes: vi.fn(),
    },
    fs: {
      writeGzipSink: vi.fn(() => ({
        writable: new Writable({ write: (_c, _e, cb) => cb() }),
        finalize: async () => {},
        destroy: async () => {},
      })),
      readGunzipSource: vi.fn(),
      joinExportFilename: (d: string, b: string) => `${d}/${b}.bson.gz`,
      indexesSidecarPath: (p: string) => p.replace(/\.bson\.gz$/, '.indexes.json'),
      writeIndexesSidecar: vi.fn(async () => {}),
      readIndexesSidecar: vi.fn(),
    },
    dialog: {
      pickSaveFile: vi.fn(),
      pickFolder: vi.fn(async () => (opts.folderPath === undefined ? '/tmp/dbf' : opts.folderPath)),
    },
    signal: opts.signal ?? new AbortController().signal,
    onProgress: vi.fn(),
  } as unknown as OperationCtx;
  return { ctx };
}

const colls = (names: string[]): CollectionInfo[] => names.map((name) => ({ name, type: 'collection' as const }));

describe('exportDatabaseOp', () => {
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
