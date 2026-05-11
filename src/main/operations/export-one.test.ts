import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import type { MongoClient } from 'mongodb';
import { exportOneCollection } from './export-one';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { IndexSpec } from '../index-spec';
import type { Result } from '../../shared/types';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };

function makeCtx(overrides?: {
  exportCollection?: (output: Writable) => Promise<Result<number>>;
  getExportableIndexes?: () => Promise<Result<IndexSpec[]>>;
  writeIndexesSidecar?: (filePath: string, json: string) => Promise<void>;
  finalize?: () => Promise<void>;
}): {
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
          if (overrides?.exportCollection) return overrides.exportCollection(output);
          output.write(Buffer.from([1, 2, 3]));
          onProgress(3);
          return { ok: true, data: 3 } as Result<number>;
        }
      ),
      importCollection: vi.fn(),
      listCollections: vi.fn(),
      getExportableIndexes: vi.fn(async () => {
        if (overrides?.getExportableIndexes) return overrides.getExportableIndexes();
        return { ok: true, data: [] } as Result<IndexSpec[]>;
      }),
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
        if (overrides?.writeIndexesSidecar) return overrides.writeIndexesSidecar(filePath, json);
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
  it('writes data file, finalizes sink, writes sidecar; returns exported count with no warning', async () => {
    const { ctx, sinks, sidecarWrites } = makeCtx({
      getExportableIndexes: async () => ({ ok: true, data: [{ name: 'i', key: { a: 1 } } as IndexSpec] }),
    });
    const res = await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.exported).toBe(3);
    expect(res.data.sidecarWarning).toBeUndefined();
    expect(sinks[0].finalized).toBe(true);
    expect(sinks[0].destroyed).toBe(false);
    expect(sidecarWrites).toHaveLength(1);
    expect(sidecarWrites[0].filePath).toBe('/tmp/c.indexes.json');
  });

  it('forwards progress through ctx.onProgress with processed count', async () => {
    const { ctx } = makeCtx();
    await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(ctx.onProgress).toHaveBeenCalled();
  });

  it('on exportCollection failure: destroys sink, no sidecar write, returns ok:false', async () => {
    const { ctx, sinks, sidecarWrites } = makeCtx({
      exportCollection: async () => ({ ok: false, error: 'boom' }),
    });
    const res = await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('boom');
    expect(sinks[0].destroyed).toBe(true);
    expect(sinks[0].finalized).toBe(false);
    expect(sidecarWrites).toHaveLength(0);
  });

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

  it('on getExportableIndexes failure: returns ok with sidecarWarning explaining the failure', async () => {
    const { ctx, sinks, sidecarWrites } = makeCtx({
      getExportableIndexes: async () => ({ ok: false, error: 'no indexes' }),
    });
    const res = await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.exported).toBe(3);
    expect(res.data.sidecarWarning).toContain('no indexes');
    expect(sinks[0].finalized).toBe(true);
    expect(sidecarWrites).toHaveLength(0);
  });

  it('on writeIndexesSidecar throwing: returns ok with sidecarWarning explaining the failure', async () => {
    const { ctx, sinks } = makeCtx({
      writeIndexesSidecar: async () => {
        throw new Error('sidecar io error');
      },
    });
    const res = await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.sidecarWarning).toContain('sidecar io error');
    expect(sinks[0].finalized).toBe(true);
  });

  it('EJSON-serializes the index specs into the sidecar JSON', async () => {
    const { ctx, sidecarWrites } = makeCtx({
      getExportableIndexes: async () => ({ ok: true, data: [{ name: 'x', key: { a: 1 } } as IndexSpec] }),
    });
    await exportOneCollection(ctx, ACTIVE, 'db', 'coll', '/tmp/c.bson.gz');
    expect(sidecarWrites).toHaveLength(1);
    const parsed = JSON.parse(sidecarWrites[0].json) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([{ name: 'x', key: { a: 1 } }]);
  });
});
