import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import type { MongoClient } from 'mongodb';
import { importCollectionOp } from './import-collection';
import type { OperationCtx } from './types';
import type { ActiveConnection } from '../connection-manager';
import type { ImportOptions, Result } from '../../shared/types';
import type { IndexSpec } from '../index-spec';

const ACTIVE: ActiveConnection = { client: {} as unknown as MongoClient, key: 'k' };
const OPTIONS: ImportOptions = { onDuplicate: 'skip', clearFirst: false };

function makeCtx(overrides?: {
  sidecar?: string | null;
  sidecarThrows?: Error;
  importResult?: Result<{ inserted: number; skipped: number }>;
  applyResult?: Result<undefined>;
}): OperationCtx {
  return {
    mongo: {
      exportCollection: vi.fn(),
      importCollection: vi.fn(
        async () =>
          overrides?.importResult ??
          ({ ok: true, data: { inserted: 10, skipped: 2 } } as Result<{ inserted: number; skipped: number }>)
      ),
      listCollections: vi.fn(),
      getExportableIndexes: vi.fn(),
      applyImportedIndexes: vi.fn(
        async () => overrides?.applyResult ?? ({ ok: true, data: undefined } as Result<undefined>)
      ),
    },
    fs: {
      writeGzipSink: vi.fn(),
      readGunzipSource: vi.fn(() => ({
        readable: Readable.from([Buffer.from('stub')]),
        destroy: async () => {},
      })),
      joinExportFilename: (d: string, b: string) => `${d}/${b}.bson.gz`,
      indexesSidecarPath: (p: string) => p.replace(/\.bson\.gz$/, '.indexes.json'),
      writeIndexesSidecar: vi.fn(),
      readIndexesSidecar: vi.fn(async () => {
        if (overrides?.sidecarThrows) throw overrides.sidecarThrows;
        return overrides?.sidecar ?? null;
      }),
    },
    dialog: { pickSaveFile: vi.fn(), pickFolder: vi.fn() },
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  } as unknown as OperationCtx;
}

const PARAMS = {
  kind: 'import-collection' as const,
  db: 'mydb',
  collection: 'users',
  filePath: '/tmp/c.bson.gz',
  options: OPTIONS,
};

describe('importCollectionOp', () => {
  it('kind is "import-collection"; params schema validates', () => {
    expect(importCollectionOp.kind).toBe('import-collection');
    expect(importCollectionOp.params.safeParse(PARAMS).success).toBe(true);
  });

  it('happy path no sidecar: returns ok with inserted/skipped and warning about missing sidecar; applyImportedIndexes NOT called', async () => {
    const ctx = makeCtx({ sidecar: null });
    const res = await importCollectionOp.run(ACTIVE, PARAMS, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toEqual({ kind: 'import-collection', inserted: 10, skipped: 2 });
    expect(res.data.warning).toBe('No indexes were restored (sidecar file not found).');
    expect(ctx.mongo.applyImportedIndexes).not.toHaveBeenCalled();
  });

  it('valid sidecar: applies indexes with dropExisting matching clearFirst', async () => {
    const validSidecarJson = JSON.stringify([{ name: 'i', key: { a: 1 } }]);
    const ctx = makeCtx({ sidecar: validSidecarJson });
    const params = { ...PARAMS, options: { ...OPTIONS, clearFirst: true } };
    const res = await importCollectionOp.run(ACTIVE, params, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.warning).toBeUndefined();
    expect(ctx.mongo.applyImportedIndexes).toHaveBeenCalledWith(
      ACTIVE,
      'mydb',
      'users',
      expect.any(Array) as IndexSpec[],
      { dropExisting: true }
    );
  });

  it('malformed sidecar: returns ok:false BEFORE data import runs', async () => {
    const ctx = makeCtx({ sidecar: 'not json' });
    const res = await importCollectionOp.run(ACTIVE, PARAMS, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('Invalid');
    expect(ctx.mongo.importCollection).not.toHaveBeenCalled();
  });

  it('readIndexesSidecar throws (non-ENOENT): returns ok:false BEFORE data import', async () => {
    const ctx = makeCtx({ sidecarThrows: new Error('EACCES') });
    const res = await importCollectionOp.run(ACTIVE, PARAMS, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('EACCES');
    expect(ctx.mongo.importCollection).not.toHaveBeenCalled();
  });

  it('data import failure: returns ok:false; applyImportedIndexes NOT called', async () => {
    const ctx = makeCtx({ importResult: { ok: false, error: 'bson invalid' } });
    const res = await importCollectionOp.run(ACTIVE, PARAMS, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('bson invalid');
    expect(ctx.mongo.applyImportedIndexes).not.toHaveBeenCalled();
  });

  it('index-apply failure: returns ok:false with error including inserted count', async () => {
    const validSidecarJson = JSON.stringify([{ name: 'i', key: { a: 1 } }]);
    const ctx = makeCtx({
      sidecar: validSidecarJson,
      importResult: { ok: true, data: { inserted: 7, skipped: 0 } },
      applyResult: { ok: false, error: 'duplicate key' },
    });
    const res = await importCollectionOp.run(ACTIVE, PARAMS, ctx);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('duplicate key');
    expect(res.error).toContain('7');
  });
});
