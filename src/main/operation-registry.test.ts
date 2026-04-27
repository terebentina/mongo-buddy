import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writable, Readable } from 'stream';
import { createOperationRegistry } from './operation-registry';
import type { MongoServicePort } from './operation-registry';
import type { IndexSpec } from './index-spec';
import { MongoService } from './mongo-service';
import type { OperationRecord, OperationParams, Result, ImportOptions, CollectionInfo } from '../shared/types';

// Compile-time check: existing MongoService structurally satisfies MongoServicePort
// (no wrapper needed). If this breaks, the port interface drifted from the service.
const _portCheck: MongoServicePort = new MongoService({
  conn: {
    requireClient: () => {
      throw new Error('port check only');
    },
  },
});
void _portCheck;

type ExportCall = {
  db: string;
  coll: string;
  output: Writable;
  onProgress: (count: number) => void;
  signal: AbortSignal;
};

type ImportCall = {
  db: string;
  coll: string;
  input: Readable;
  options: ImportOptions;
  onProgress: (count: number) => void;
  signal: AbortSignal;
};

/**
 * In-memory fake implementations of the registry's ports. Keeping them in
 * this file (rather than extracting) so test intent stays local.
 */

function makeFsPort(
  overrides: {
    writeIndexesSidecar?: (filePath: string, json: string) => Promise<void>;
    readIndexesSidecar?: (filePath: string) => Promise<string | null>;
  } = {}
) {
  const sinks: Array<{
    filePath: string;
    writes: Buffer[];
    finalized: boolean;
    destroyed: boolean;
  }> = [];
  const sources: Array<{ filePath: string; destroyed: boolean }> = [];
  const sidecarWrites: Array<{ filePath: string; json: string }> = [];

  return {
    writeGzipSink: vi.fn((filePath: string) => {
      const entry = { filePath, writes: [] as Buffer[], finalized: false, destroyed: false };
      sinks.push(entry);
      const writable = new Writable({
        write(chunk, _enc, cb) {
          entry.writes.push(Buffer.from(chunk));
          cb();
        },
      });
      return {
        writable,
        finalize: async () => {
          entry.finalized = true;
        },
        destroy: async () => {
          entry.destroyed = true;
        },
      };
    }),
    readGunzipSource: vi.fn((filePath: string) => {
      const entry = { filePath, destroyed: false };
      sources.push(entry);
      const readable = Readable.from([Buffer.from('stub')]);
      return {
        readable,
        destroy: async () => {
          entry.destroyed = true;
        },
      };
    }),
    joinExportFilename: (dir: string, base: string): string => `${dir}/${base}.bson.gz`,
    indexesSidecarPath: (dataFilePath: string): string => {
      if (!dataFilePath.endsWith('.bson.gz')) {
        throw new Error(`Expected .bson.gz suffix, got: ${dataFilePath}`);
      }
      return dataFilePath.slice(0, -'.bson.gz'.length) + '.indexes.json';
    },
    writeIndexesSidecar: vi.fn(async (filePath: string, json: string): Promise<void> => {
      if (overrides.writeIndexesSidecar) {
        await overrides.writeIndexesSidecar(filePath, json);
        return;
      }
      sidecarWrites.push({ filePath, json });
    }),
    readIndexesSidecar: vi.fn(async (filePath: string): Promise<string | null> => {
      if (overrides.readIndexesSidecar) {
        return overrides.readIndexesSidecar(filePath);
      }
      return null;
    }),
    _sinks: sinks,
    _sources: sources,
    _sidecarWrites: sidecarWrites,
  };
}

function makeDialogPort(overrides: Partial<{ savePath: string | null; folderPath: string | null }> = {}) {
  const savePath = overrides.savePath === undefined ? '/tmp/picked.bson.gz' : overrides.savePath;
  const folderPath = overrides.folderPath === undefined ? '/tmp/dbfolder' : overrides.folderPath;
  return {
    pickSaveFile: vi.fn(async (_suggestedBase: string) => savePath),
    pickFolder: vi.fn(async () => folderPath),
  };
}

function makeMongoPort(
  overrides: {
    exportCollection?: (call: ExportCall) => Promise<Result<number>>;
    importCollection?: (call: ImportCall) => Promise<Result<{ inserted: number; skipped: number }>>;
    listCollections?: (db: string) => Promise<Result<CollectionInfo[]>>;
    getExportableIndexes?: (db: string, coll: string) => Promise<Result<IndexSpec[]>>;
    applyImportedIndexes?: (
      db: string,
      coll: string,
      specs: IndexSpec[],
      opts: { dropExisting: boolean }
    ) => Promise<Result<undefined>>;
  } = {}
) {
  return {
    exportCollection: vi.fn(
      (
        db: string,
        coll: string,
        output: Writable,
        onProgress: (count: number) => void,
        signal: AbortSignal
      ): Promise<Result<number>> => {
        if (overrides.exportCollection) {
          return overrides.exportCollection({ db, coll, output, onProgress, signal });
        }
        // default: 3 docs, write some bytes, report progress
        return (async () => {
          output.write(Buffer.from([1, 2, 3]));
          onProgress(1);
          onProgress(2);
          output.write(Buffer.from([4, 5, 6]));
          onProgress(3);
          return { ok: true, data: 3 };
        })();
      }
    ),
    importCollection: vi.fn(
      (
        db: string,
        coll: string,
        input: Readable,
        options: ImportOptions,
        onProgress: (count: number) => void,
        signal: AbortSignal
      ): Promise<Result<{ inserted: number; skipped: number }>> => {
        if (overrides.importCollection) {
          return overrides.importCollection({ db, coll, input, options, onProgress, signal });
        }
        return (async () => {
          onProgress(5);
          onProgress(10);
          return { ok: true, data: { inserted: 10, skipped: 2 } };
        })();
      }
    ),
    listCollections: vi.fn((db: string): Promise<Result<CollectionInfo[]>> => {
      if (overrides.listCollections) return overrides.listCollections(db);
      return Promise.resolve({ ok: true, data: [] });
    }),
    getExportableIndexes: vi.fn((db: string, coll: string): Promise<Result<IndexSpec[]>> => {
      if (overrides.getExportableIndexes) return overrides.getExportableIndexes(db, coll);
      return Promise.resolve({ ok: true, data: [] });
    }),
    applyImportedIndexes: vi.fn(
      (db: string, coll: string, specs: IndexSpec[], opts: { dropExisting: boolean }): Promise<Result<undefined>> => {
        if (overrides.applyImportedIndexes) return overrides.applyImportedIndexes(db, coll, specs, opts);
        return Promise.resolve({ ok: true, data: undefined });
      }
    ),
  };
}

type Emits = OperationRecord[];

function makeEmitSpy(): { emits: Emits; emit: (rec: OperationRecord) => void } {
  const emits: Emits = [];
  return {
    emits,
    emit: (rec) => {
      emits.push(JSON.parse(JSON.stringify(rec)) as OperationRecord);
    },
  };
}

function waitForTerminal(emits: Emits): Promise<OperationRecord> {
  return new Promise((resolve) => {
    const check = (): void => {
      const last = emits[emits.length - 1];
      if (last && (last.status === 'succeeded' || last.status === 'failed' || last.status === 'cancelled')) {
        resolve(last);
      } else {
        setTimeout(check, 1);
      }
    };
    check();
  });
}

describe('OperationRegistry', () => {
  beforeEach(() => {
    // No-op; each test builds its own emit spy to avoid cross-test closure leakage.
  });

  describe('export-collection', () => {
    it('happy path: emits pending → running → succeeded with monotonic progress and final exported count', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/users.bson.gz' });
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const params: OperationParams = { kind: 'export-collection', db: 'mydb', collection: 'users' };
      const res = registry.start(params);
      expect(res.ok).toBe(true);
      const id = res.ok ? res.data : '';
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.result).toEqual({
        kind: 'export-collection',
        exported: 3,
        path: '/tmp/users.bson.gz',
      });

      // status transitions include pending and running at least once before terminal
      const statuses = emits.map((e) => e.status);
      expect(statuses[0]).toBe('pending');
      expect(statuses).toContain('running');
      expect(statuses[statuses.length - 1]).toBe('succeeded');

      // progress.processed monotonic non-decreasing
      const progresses = emits.map((e) => e.progress.processed);
      for (let i = 1; i < progresses.length; i++) {
        expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
      }

      // sink was finalized (not destroyed), dialog was consulted
      expect(fs._sinks).toHaveLength(1);
      expect(fs._sinks[0].finalized).toBe(true);
      expect(fs._sinks[0].destroyed).toBe(false);
      expect(dialog.pickSaveFile).toHaveBeenCalledTimes(1);
      expect(dialog.pickSaveFile).toHaveBeenCalledWith('users');

      // mongo called with correct db/coll
      expect(mongo.exportCollection).toHaveBeenCalledTimes(1);
      const callArgs = mongo.exportCollection.mock.calls[0];
      expect(callArgs[0]).toBe('mydb');
      expect(callArgs[1]).toBe('users');
    });
  });

  describe('export-collection sidecar', () => {
    it('writes the indexes sidecar after sink.finalize() with EJSON-serialized specs', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/users.bson.gz' });
      const mongo = makeMongoPort({
        getExportableIndexes: async () => ({
          ok: true,
          data: [{ key: { email: 1 }, name: 'email_1', unique: true }],
        }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-collection', db: 'mydb', collection: 'users' });
      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeUndefined();

      expect(fs._sidecarWrites).toHaveLength(1);
      expect(fs._sidecarWrites[0].filePath).toBe('/tmp/users.indexes.json');
      const parsed = JSON.parse(fs._sidecarWrites[0].json);
      expect(parsed).toEqual([{ key: { email: 1 }, name: 'email_1', unique: true }]);
      expect(mongo.getExportableIndexes).toHaveBeenCalledWith('mydb', 'users');
    });

    it('skips sidecar write when user cancelled the save dialog', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: null });
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-collection', db: 'mydb', collection: 'users' });
      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(fs._sidecarWrites).toHaveLength(0);
      expect(mongo.getExportableIndexes).not.toHaveBeenCalled();
    });

    it('still succeeds with a warning when sidecar write fails', async () => {
      const fs = makeFsPort({
        writeIndexesSidecar: async () => {
          throw new Error('EACCES: read-only directory');
        },
      });
      const dialog = makeDialogPort({ savePath: '/tmp/users.bson.gz' });
      const mongo = makeMongoPort({
        getExportableIndexes: async () => ({ ok: true, data: [{ key: { x: 1 }, name: 'x_1' }] }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-collection', db: 'mydb', collection: 'users' });
      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toMatch(/EACCES/);
      // Data file finalized regardless
      expect(fs._sinks[0].finalized).toBe(true);
    });

    it('still succeeds with a warning when reading the indexes fails', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/users.bson.gz' });
      const mongo = makeMongoPort({
        getExportableIndexes: async () => ({ ok: false, error: 'ns not found' }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-collection', db: 'mydb', collection: 'users' });
      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toMatch(/ns not found/);
      expect(fs._sidecarWrites).toHaveLength(0);
    });
  });

  describe('import-collection', () => {
    it('happy path: emits pending → running → succeeded with monotonic progress and final inserted/skipped', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort();
      const mongo = makeMongoPort({
        importCollection: async ({ onProgress }) => {
          onProgress(3);
          onProgress(7);
          onProgress(10);
          return { ok: true, data: { inserted: 8, skipped: 2 } };
        },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const params: OperationParams = {
        kind: 'import-collection',
        db: 'mydb',
        collection: 'users',
        filePath: '/tmp/input.bson.gz',
        options: { onDuplicate: 'skip', clearFirst: false },
      };
      const res = registry.start(params);
      expect(res.ok).toBe(true);

      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.result).toEqual({
        kind: 'import-collection',
        inserted: 8,
        skipped: 2,
      });

      const statuses = emits.map((e) => e.status);
      expect(statuses[0]).toBe('pending');
      expect(statuses).toContain('running');
      expect(statuses[statuses.length - 1]).toBe('succeeded');

      const progresses = emits.map((e) => e.progress.processed);
      for (let i = 1; i < progresses.length; i++) {
        expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]);
      }

      expect(fs._sources).toHaveLength(1);
      expect(fs._sources[0].filePath).toBe('/tmp/input.bson.gz');
      expect(fs._sources[0].destroyed).toBe(true);

      expect(mongo.importCollection).toHaveBeenCalledTimes(1);
      const args = mongo.importCollection.mock.calls[0];
      expect(args[0]).toBe('mydb');
      expect(args[1]).toBe('users');
      expect(args[3]).toEqual({ onDuplicate: 'skip', clearFirst: false });
    });
  });

  describe('import-collection sidecar', () => {
    const importParams = (overrides: Partial<{ clearFirst: boolean }> = {}): OperationParams => ({
      kind: 'import-collection',
      db: 'mydb',
      collection: 'users',
      filePath: '/tmp/input.bson.gz',
      options: { onDuplicate: 'skip', clearFirst: overrides.clearFirst ?? false },
    });

    it('missing sidecar: data import succeeds with a warning, applyImportedIndexes not called', async () => {
      const fs = makeFsPort(); // default readIndexesSidecar returns null
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams());
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeDefined();
      expect(terminal.warning).toMatch(/sidecar/i);
      expect(mongo.applyImportedIndexes).not.toHaveBeenCalled();
      expect(fs.readIndexesSidecar).toHaveBeenCalledWith('/tmp/input.indexes.json');
    });

    it('valid sidecar: applies indexes after data import with dropExisting=clearFirst', async () => {
      const specs = [{ key: { email: 1 }, name: 'email_1', unique: true }];
      const json = JSON.stringify(specs);
      const fs = makeFsPort({ readIndexesSidecar: async () => json });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: true }));
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeUndefined();
      expect(mongo.applyImportedIndexes).toHaveBeenCalledTimes(1);
      const callArgs = mongo.applyImportedIndexes.mock.calls[0];
      expect(callArgs[0]).toBe('mydb');
      expect(callArgs[1]).toBe('users');
      expect(callArgs[2]).toEqual(specs);
      expect(callArgs[3]).toEqual({ dropExisting: true });
    });

    it('valid sidecar with clearFirst=false: applies indexes with dropExisting=false', async () => {
      const specs = [{ key: { x: 1 }, name: 'x_1' }];
      const fs = makeFsPort({ readIndexesSidecar: async () => JSON.stringify(specs) });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: false }));
      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(mongo.applyImportedIndexes).toHaveBeenCalledTimes(1);
      expect(mongo.applyImportedIndexes.mock.calls[0][3]).toEqual({ dropExisting: false });
    });

    it('malformed sidecar: fails before any data operation runs', async () => {
      const fs = makeFsPort({ readIndexesSidecar: async () => 'not valid json {{{' });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: true }));
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toBeDefined();
      // Critical: importCollection (which does deleteMany) must NOT have been called
      expect(mongo.importCollection).not.toHaveBeenCalled();
      expect(mongo.applyImportedIndexes).not.toHaveBeenCalled();
    });

    it('sidecar that is not an array: fails before any data operation runs', async () => {
      const fs = makeFsPort({ readIndexesSidecar: async () => JSON.stringify({ not: 'an array' }) });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: true }));
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(mongo.importCollection).not.toHaveBeenCalled();
    });

    it('index-create failure: marks op failed with inserted-count message', async () => {
      const specs = [{ key: { email: 1 }, name: 'email_1', unique: true }];
      const fs = makeFsPort({ readIndexesSidecar: async () => JSON.stringify(specs) });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort({
        importCollection: async () => ({ ok: true, data: { inserted: 42, skipped: 0 } }),
        applyImportedIndexes: async () => ({ ok: false, error: 'duplicate key violation' }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: false }));
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toMatch(/duplicate key violation/);
      expect(terminal.error).toMatch(/42/);
    });

    it('data-import failure: does not call applyImportedIndexes', async () => {
      const specs = [{ key: { x: 1 }, name: 'x_1' }];
      const fs = makeFsPort({ readIndexesSidecar: async () => JSON.stringify(specs) });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort({
        importCollection: async () => ({ ok: false, error: 'bson decode failed' }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams());
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toBe('bson decode failed');
      expect(mongo.applyImportedIndexes).not.toHaveBeenCalled();
    });

    it('readIndexesSidecar throwing a non-ENOENT error: fails before any data operation', async () => {
      const fs = makeFsPort({
        readIndexesSidecar: async () => {
          throw new Error('EACCES: permission denied');
        },
      });
      const dialog = makeDialogPort();
      const mongo = makeMongoPort();
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start(importParams({ clearFirst: true }));
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toMatch(/EACCES/);
      expect(mongo.importCollection).not.toHaveBeenCalled();
    });
  });

  describe('export-database', () => {
    it('iterates collections with progress.label updated per collection', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection', count: 1 },
            { name: 'b', type: 'collection', count: 1 },
            { name: 'c', type: 'collection', count: 1 },
            { name: 'v', type: 'view', count: 0 }, // should be skipped
          ],
        }),
        exportCollection: async ({ onProgress }) => {
          onProgress(1);
          return { ok: true, data: 10 };
        },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const res = registry.start({ kind: 'export-database', db: 'mydb' });
      expect(res.ok).toBe(true);

      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('succeeded');
      expect(terminal.result).toEqual({
        kind: 'export-database',
        exported: 30,
        folder: '/tmp/out',
      });

      const labels = emits.map((e) => e.progress.label).filter((l): l is string => !!l);
      expect(labels).toContain('a');
      expect(labels).toContain('b');
      expect(labels).toContain('c');

      // views skipped: only 3 export calls
      expect(mongo.exportCollection).toHaveBeenCalledTimes(3);
      expect(fs._sinks.map((s) => s.filePath)).toEqual([
        '/tmp/out/a.bson.gz',
        '/tmp/out/b.bson.gz',
        '/tmp/out/c.bson.gz',
      ]);
      expect(fs._sinks.every((s) => s.finalized)).toBe(true);
    });

    it('cancel mid-db-export cancels only the current collection and records partial progress', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });

      let cancelFn: (() => void) | null = null;
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
            { name: 'c', type: 'collection' },
          ],
        }),
        exportCollection: async ({ coll, signal, onProgress }) => {
          if (coll === 'a') {
            onProgress(5);
            return { ok: true, data: 5 };
          }
          if (coll === 'b') {
            // Simulate a longer stream during which the user cancels
            onProgress(1);
            if (cancelFn) cancelFn();
            // After abort, return failure with signal aborted
            await new Promise((r) => setTimeout(r, 1));
            if (signal.aborted) return { ok: false, error: 'cancelled' };
            return { ok: true, data: 100 };
          }
          return { ok: true, data: 999 };
        },
      });

      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });
      const res = registry.start({ kind: 'export-database', db: 'mydb' });
      expect(res.ok).toBe(true);
      const id = res.ok ? res.data : '';
      cancelFn = () => registry.cancel(id);

      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('cancelled');

      // a finalized, b destroyed, c never opened
      expect(fs._sinks).toHaveLength(2);
      expect(fs._sinks[0].filePath).toBe('/tmp/out/a.bson.gz');
      expect(fs._sinks[0].finalized).toBe(true);
      expect(fs._sinks[0].destroyed).toBe(false);
      expect(fs._sinks[1].filePath).toBe('/tmp/out/b.bson.gz');
      expect(fs._sinks[1].destroyed).toBe(true);

      // only a and b reached mongo.exportCollection
      expect(mongo.exportCollection).toHaveBeenCalledTimes(2);
    });
  });

  describe('export-database sidecar', () => {
    it('writes one indexes sidecar per collection, no warning on success', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
          ],
        }),
        exportCollection: async () => ({ ok: true, data: 1 }),
        getExportableIndexes: async (_db, coll) => ({
          ok: true,
          data: [{ key: { x: 1 }, name: `${coll}_x_1` }],
        }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-database', db: 'mydb' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeUndefined();

      expect(fs._sidecarWrites.map((s) => s.filePath)).toEqual(['/tmp/out/a.indexes.json', '/tmp/out/b.indexes.json']);
      expect(JSON.parse(fs._sidecarWrites[0].json)).toEqual([{ key: { x: 1 }, name: 'a_x_1' }]);
      expect(JSON.parse(fs._sidecarWrites[1].json)).toEqual([{ key: { x: 1 }, name: 'b_x_1' }]);
      expect(mongo.getExportableIndexes).toHaveBeenCalledTimes(2);
    });

    it('accumulates per-collection sidecar-write errors into a warning; other sidecars still written', async () => {
      const written: string[] = [];
      const fs = makeFsPort({
        writeIndexesSidecar: async (filePath) => {
          if (filePath === '/tmp/out/b.indexes.json') {
            throw new Error('disk full');
          }
          written.push(filePath);
        },
      });
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
            { name: 'c', type: 'collection' },
          ],
        }),
        exportCollection: async () => ({ ok: true, data: 1 }),
        getExportableIndexes: async () => ({ ok: true, data: [{ key: { x: 1 }, name: 'x_1' }] }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-database', db: 'mydb' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeDefined();
      expect(terminal.warning).toContain('b');
      // a and c still got written
      expect(written).toEqual(['/tmp/out/a.indexes.json', '/tmp/out/c.indexes.json']);
      // all 3 data files were finalized
      expect(fs._sinks.every((s) => s.finalized)).toBe(true);
    });

    it('lists multiple bad collections in a single accumulated warning', async () => {
      const fs = makeFsPort({
        writeIndexesSidecar: async (filePath) => {
          if (filePath === '/tmp/out/b.indexes.json' || filePath === '/tmp/out/c.indexes.json') {
            throw new Error('boom');
          }
        },
      });
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
            { name: 'c', type: 'collection' },
          ],
        }),
        exportCollection: async () => ({ ok: true, data: 1 }),
        getExportableIndexes: async () => ({ ok: true, data: [{ key: { x: 1 }, name: 'x_1' }] }),
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-database', db: 'mydb' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeDefined();
      // Extract the comma-separated names list and check exactly which collections appear
      const match = /sidecar errors for:\s*(.*)$/.exec(terminal.warning ?? '');
      expect(match).not.toBeNull();
      const names = match![1].split(',').map((s) => s.trim());
      expect(names).toEqual(['b', 'c']);
    });

    it('records a warning when getExportableIndexes fails for one collection', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
          ],
        }),
        exportCollection: async () => ({ ok: true, data: 1 }),
        getExportableIndexes: async (_db, coll) =>
          coll === 'a' ? { ok: false, error: 'ns not found' } : { ok: true, data: [] },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-database', db: 'mydb' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('succeeded');
      expect(terminal.warning).toBeDefined();
      expect(terminal.warning).toContain('a');
      // b's sidecar still got written
      expect(fs._sidecarWrites.map((s) => s.filePath)).toEqual(['/tmp/out/b.indexes.json']);
    });

    it('data-export failure still fails the operation (sidecar errors do not change this)', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ folderPath: '/tmp/out' });
      const mongo = makeMongoPort({
        listCollections: async () => ({
          ok: true,
          data: [
            { name: 'a', type: 'collection' },
            { name: 'b', type: 'collection' },
          ],
        }),
        exportCollection: async ({ coll }) =>
          coll === 'a' ? { ok: true, data: 1 } : { ok: false, error: 'disk read error' },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-database', db: 'mydb' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toBe('disk read error');
    });
  });

  describe('enqueue guard', () => {
    it('rejects second start() with same scope key while in-flight; accepts after terminal', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort();
      let release: (() => void) | null = null;
      const mongo = makeMongoPort({
        exportCollection: async ({ onProgress }) => {
          onProgress(1);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { ok: true, data: 1 };
        },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const params: OperationParams = { kind: 'export-collection', db: 'd', collection: 'c' };
      const first = registry.start(params);
      expect(first.ok).toBe(true);

      // Wait for runner to enter mongo.exportCollection (in-flight guard active)
      await vi.waitFor(() => expect(mongo.exportCollection).toHaveBeenCalledTimes(1));

      const second = registry.start(params);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error).toMatch(/already running/i);

      // Release the first op, let it terminate
      release!();
      await waitForTerminal(emits);

      // Now the same scope accepts a new op
      const third = registry.start(params);
      expect(third.ok).toBe(true);

      // Let the third runner finish to avoid async leakage into later tests
      await vi.waitFor(() => expect(mongo.exportCollection).toHaveBeenCalledTimes(2));
      release!();
      await vi.waitFor(() => expect(emits.filter((e) => e.status === 'succeeded')).toHaveLength(2));
    });
  });

  describe('cancel mid-stream cleanup', () => {
    it('terminal cancelled, sink.destroy called, in-flight released', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/x.bson.gz' });
      let cancelFn: (() => void) | null = null;
      const mongo = makeMongoPort({
        exportCollection: async ({ onProgress, signal }) => {
          onProgress(1);
          cancelFn!();
          await new Promise((r) => setTimeout(r, 1));
          if (signal.aborted) return { ok: false, error: 'cancelled' };
          return { ok: true, data: 999 };
        },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const res = registry.start({ kind: 'export-collection', db: 'd', collection: 'c' });
      expect(res.ok).toBe(true);
      const id = res.ok ? res.data : '';
      cancelFn = () => registry.cancel(id);

      const terminal = await waitForTerminal(emits);
      expect(terminal.status).toBe('cancelled');

      expect(fs._sinks).toHaveLength(1);
      expect(fs._sinks[0].destroyed).toBe(true);
      expect(fs._sinks[0].finalized).toBe(false);

      // In-flight released: same scope key can start again
      const again = registry.start({ kind: 'export-collection', db: 'd', collection: 'c' });
      expect(again.ok).toBe(true);
    });
  });

  describe('failure mid-stream cleanup', () => {
    it('terminal failed, sink.destroy called, error propagated', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/x.bson.gz' });
      const mongo = makeMongoPort({
        exportCollection: async ({ onProgress }) => {
          onProgress(1);
          return { ok: false, error: 'disk full' };
        },
      });
      const { emits, emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      registry.start({ kind: 'export-collection', db: 'd', collection: 'c' });
      const terminal = await waitForTerminal(emits);

      expect(terminal.status).toBe('failed');
      expect(terminal.error).toBe('disk full');

      expect(fs._sinks[0].destroyed).toBe(true);
      expect(fs._sinks[0].finalized).toBe(false);
    });
  });

  describe('in-flight key released before terminal emit', () => {
    it('a subscriber that re-starts same scope on terminal succeeds without "already running"', async () => {
      const fs = makeFsPort();
      const dialog = makeDialogPort({ savePath: '/tmp/x.bson.gz' });
      const mongo = makeMongoPort();
      const { emit } = makeEmitSpy();
      const registry = createOperationRegistry({ mongo, fs, dialog, emit });

      const params: OperationParams = { kind: 'export-collection', db: 'd', collection: 'c' };
      let restartResult: Result<string> | null = null;

      registry.subscribe((rec: OperationRecord) => {
        if (rec.status === 'succeeded' && rec.params.kind === 'export-collection' && restartResult === null) {
          restartResult = registry.start(params);
        }
      });

      registry.start(params);
      // wait for both terminals
      await vi.waitFor(() => {
        expect(restartResult).not.toBeNull();
      });
      expect(restartResult!.ok).toBe(true);
    });
  });
});
