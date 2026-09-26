import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportOneCollection } from './export-one';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { IndexSpec } from '../index-spec';
import type { Result } from '../../shared/types';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

function makeCtx(overrides?: { finalize?: () => Promise<void> }): {
  ctx: OperationCtx;
  sinks: { filePath: string; finalized: boolean; destroyed: boolean }[];
  sidecarWrites: { filePath: string; json: string }[];
} {
  const sinks: { filePath: string; finalized: boolean; destroyed: boolean }[] = [];
  const sidecarWrites: { filePath: string; json: string }[] = [];
  const ctx = {
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
          output.write(Buffer.from([1, 2, 3]));
          onProgress(3);
          return { ok: true, data: 3 } as Result<number>;
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(),
      getExportableIndexes: vi.fn(async () => ({ ok: true, data: [] }) as Result<IndexSpec[]>),
      applyImportedIndexes: vi.fn(),
    },
    fs: {
      writeGzipSink: vi.fn((filePath: string) => {
        const entry = { filePath, finalized: false, destroyed: false };
        sinks.push(entry);
        const writable = new Writable({ write: (_c, _e, cb) => cb() });
        return {
          writable,
          finalize: async () => {
            if (overrides?.finalize) return overrides.finalize();
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
    dialog: { pickSaveFile: vi.fn(), pickFolder: vi.fn() },
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  } as unknown as OperationCtx;
  return { ctx, sinks, sidecarWrites };
}

describe('exportOneCollection', () => {
  it('on finalize failure: returns ok:false with finalize error, sink destroyed', async () => {
    const { ctx, sinks, sidecarWrites } = makeCtx({
      finalize: async () => {
        throw new Error('disk full');
      },
    });
    const res = await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('disk full');
    expect(sinks[0].destroyed).toBe(true);
    expect(sidecarWrites).toHaveLength(0);
  });
});
