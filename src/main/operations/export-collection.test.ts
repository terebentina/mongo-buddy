import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportCollectionOp } from './export-collection';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { Result } from '../../shared/types';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

function makeCtx(overrides?: {
  savePath?: string | null;
  exportData?: number | { ok: false; error: string };
  sidecarFails?: boolean;
}): OperationCtx {
  return {
    mongo: {
      exportCollection: vi.fn(
        async (
          _a: ActiveConnection,
          _db: string,
          _c: string,
          output: Writable,
          onProgress: (n: number) => void,
          _signal: AbortSignal
        ) => {
          if (overrides?.exportData && typeof overrides.exportData === 'object') return overrides.exportData;
          const count = (overrides?.exportData as number | undefined) ?? 3;
          output.write(Buffer.from([1]));
          onProgress(count);
          return { ok: true, data: count } as Result<number>;
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(),
      getExportableIndexes: vi.fn(async () => {
        if (overrides?.sidecarFails) return { ok: false, error: 'no indexes' } as const;
        return { ok: true, data: [] } as const;
      }),
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
      pickSaveFile: vi.fn(async () => (overrides?.savePath === undefined ? '/tmp/c.bson.gz' : overrides.savePath)),
      pickFolder: vi.fn(),
    },
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  } as unknown as OperationCtx;
}

describe('exportCollectionOp', () => {
  it('kind is "export-collection"', () => {
    expect(exportCollectionOp.kind).toBe('export-collection');
  });

  it('params schema validates a well-formed params object', () => {
    const parsed = exportCollectionOp.params.safeParse({
      kind: 'export-collection',
      db: 'mydb',
      collection: 'users',
    });
    expect(parsed.success).toBe(true);
  });

  it('params schema rejects when collection missing', () => {
    const parsed = exportCollectionOp.params.safeParse({ kind: 'export-collection', db: 'mydb' });
    expect(parsed.success).toBe(false);
  });

  it('happy path: returns ok with kind/exported/path and no warning', async () => {
    const ctx = makeCtx();
    const res = await exportCollectionOp.run(
      ACTIVE,
      { kind: 'export-collection', db: 'mydb', collection: 'users' },
      ctx
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toEqual({ kind: 'export-collection', exported: 3, path: '/tmp/c.bson.gz' });
    expect(res.data.warning).toBeUndefined();
    expect(ctx.dialog.pickSaveFile).toHaveBeenCalledWith('users');
  });

  it('dialog cancelled (savePath=null): returns ok with exported:0, path:null, no mongo call', async () => {
    const ctx = makeCtx({ savePath: null });
    const res = await exportCollectionOp.run(
      ACTIVE,
      { kind: 'export-collection', db: 'mydb', collection: 'users' },
      ctx
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toEqual({ kind: 'export-collection', exported: 0, path: null });
    expect(ctx.mongo.exportCollection).not.toHaveBeenCalled();
  });

  it('sidecar failure: returns ok with warning, exported count preserved', async () => {
    const ctx = makeCtx({ sidecarFails: true });
    const res = await exportCollectionOp.run(
      ACTIVE,
      { kind: 'export-collection', db: 'mydb', collection: 'users' },
      ctx
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data.exported).toBe(3);
    expect(res.data.warning).toContain('no indexes');
  });

  it('data export failure: returns ok:false with the error', async () => {
    const ctx = makeCtx({ exportData: { ok: false, error: 'driver kaboom' } });
    const res = await exportCollectionOp.run(
      ACTIVE,
      { kind: 'export-collection', db: 'mydb', collection: 'users' },
      ctx
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('driver kaboom');
  });
});
