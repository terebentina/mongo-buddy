import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportCollectionOp } from './export-collection';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { Result } from '../../shared/types';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

function makeCtx(overrides?: { savePath?: string | null }): OperationCtx {
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
          output.write(Buffer.from([1]));
          onProgress(3);
          return { ok: true, data: 3 } as Result<number>;
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(),
      getExportableIndexes: vi.fn(async () => ({ ok: true, data: [] })),
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
});
