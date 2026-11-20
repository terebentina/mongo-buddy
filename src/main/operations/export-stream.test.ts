import { afterEach, describe, expect, it } from 'vitest';
import { Writable } from 'stream';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gunzipSync } from 'zlib';
import { BSON, ObjectId } from 'bson';
import type { MongoClient } from 'mongodb';
import { MongoService } from '../mongo-service';
import type { ActiveConnection } from '../connection-manager';
import { createFsSinkAdapter } from '../adapters/fs-sink';
import { exportOneCollection } from './export-one';
import { exportDatabaseOp } from './export-database';
import type { OperationCtx } from './types';

function blockedCursor() {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let closed = false;
  return {
    entered: entered.promise,
    release: () => release.resolve(),
    get closed() {
      return closed;
    },
    find: (_filter: unknown, options?: { signal?: AbortSignal }) => ({
      close: async () => {
        closed = true;
      },
      async *[Symbol.asyncIterator]() {
        const signal = options?.signal;
        let onAbort: (() => void) | undefined;
        try {
          const pending = Promise.withResolvers<void>();
          onAbort = () => pending.reject(signal?.reason ?? new Error('Aborted'));
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
          void release.promise.then(pending.resolve);
          entered.resolve();
          await pending.promise;
          yield { _id: 'released' };
        } finally {
          if (onAbort) signal?.removeEventListener('abort', onAbort);
          closed = true;
        }
      },
    }),
  };
}

function activeWith(collection: object): ActiveConnection {
  return {
    client: { db: () => ({ collection: () => collection }) } as unknown as MongoClient,
    key: 'export-test',
  };
}

async function tempFolder() {
  const folder = await mkdtemp(path.join(tmpdir(), 'mongo-buddy-export-'));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

function context(signal: AbortSignal, folder: string): OperationCtx {
  return {
    mongo: new MongoService(),
    fs: createFsSinkAdapter(),
    dialog: { pickSaveFile: async () => null, pickFolder: async () => folder },
    signal,
    onProgress: () => {},
  };
}

function collectionWith(docs: object[]) {
  return {
    find: () => ({
      close: async () => {},
      async *[Symbol.asyncIterator]() {
        yield* docs;
      },
    }),
    listIndexes: () => ({
      toArray: async () => [
        { name: '_id_', key: { _id: 1 } },
        { name: 'n_1', key: { n: 1 } },
      ],
      close: async () => {},
    }),
  };
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const clean of cleanup.splice(0).reverse()) await clean();
});

describe('export stream lifecycle', () => {
  it('cancels a pending MongoDB read and releases its cursor', async () => {
    const cursor = blockedCursor();
    const output = new Writable({ write: (_chunk, _encoding, done) => done() });
    const controller = new AbortController();
    const result = new MongoService().exportCollection(
      activeWith(cursor),
      'db',
      'coll',
      output,
      () => {},
      controller.signal
    );
    cleanup.push(async () => {
      cursor.release();
      await result;
      output.destroy();
    });
    await cursor.entered;
    controller.abort();
    expect((await result).ok).toBe(false);
    expect(cursor.closed).toBe(true);
  });

  it('cancels while output is backpressured instead of waiting forever for drain', async () => {
    const writing = Promise.withResolvers<void>();
    let finishWrite: ((error?: Error | null) => void) | undefined;
    let closed = false;
    const output = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, done) {
        finishWrite = done;
        writing.resolve();
      },
    });
    const active = activeWith({
      find: () => ({
        close: async () => {
          closed = true;
        },
        async *[Symbol.asyncIterator]() {
          try {
            yield { _id: 'one', data: 'payload' };
          } finally {
            closed = true;
          }
        },
      }),
    });
    const controller = new AbortController();
    const result = new MongoService().exportCollection(active, 'db', 'coll', output, () => {}, controller.signal);
    cleanup.push(async () => {
      finishWrite?.();
      await result;
      output.destroy();
    });
    await writing.promise;
    controller.abort();
    expect((await result).ok).toBe(false);
    expect(closed).toBe(true);
    expect(output.destroyed).toBe(true);
  });

  it('stops a pending database read when the output fails', async () => {
    const cursor = blockedCursor();
    const output = new Writable({ write: (_chunk, _encoding, done) => done() });
    // Keep the injected external failure observable without an uncaught event on the old implementation.
    output.on('error', () => {});
    const result = new MongoService().exportCollection(
      activeWith(cursor),
      'db',
      'coll',
      output,
      () => {},
      new AbortController().signal
    );
    cleanup.push(async () => {
      cursor.release();
      await result;
      output.destroy();
    });
    await cursor.entered;
    output.destroy(new Error('disk full'));
    expect(await result).toMatchObject({ ok: false, error: expect.stringContaining('disk full') });
    expect(cursor.closed).toBe(true);
  });

  it('finishes a multi-chunk export as readable BSON gzip with its index sidecar', async () => {
    const folder = await tempFolder();
    const filePath = path.join(folder, 'coll.bson.gz');
    const docs = Array.from({ length: 64 }, (_, n) => ({
      _id: new ObjectId(n.toString(16).padStart(24, '0')),
      n,
      payload: 'data'.repeat(4096),
    }));
    const result = await exportOneCollection(
      context(new AbortController().signal, folder),
      activeWith(collectionWith(docs)),
      'db',
      'coll',
      filePath
    );
    expect(result).toMatchObject({ ok: true, data: { exported: docs.length } });
    const data = gunzipSync(await readFile(filePath));
    const actual: object[] = [];
    for (let offset = 0; offset < data.length;) {
      const size = data.readInt32LE(offset);
      actual.push(BSON.deserialize(data.subarray(offset, offset + size)));
      offset += size;
    }
    expect(actual).toEqual(docs);
    expect(JSON.parse(await readFile(path.join(folder, 'coll.indexes.json'), 'utf8'))).toEqual([
      { name: 'n_1', key: { n: 1 } },
    ]);
  });

  it('fails an early file-open error and stops the pending database read', async () => {
    const folder = await tempFolder();
    const cursor = blockedCursor();
    const controller = new AbortController();
    const result = exportOneCollection(
      context(controller.signal, folder),
      activeWith(cursor),
      'db',
      'coll',
      path.join(folder, 'missing', 'coll.bson.gz')
    );
    cleanup.push(async () => {
      cursor.release();
      controller.abort();
      await result;
    });
    expect(await result).toMatchObject({ ok: false, error: expect.stringContaining('ENOENT') });
    expect(cursor.closed).toBe(true);
    expect(await readdir(folder)).toEqual([]);
  });

  it('removes partial data when cancelling a pending database read', async () => {
    const folder = await tempFolder();
    const cursor = blockedCursor();
    const controller = new AbortController();
    const result = exportOneCollection(
      context(controller.signal, folder),
      activeWith(cursor),
      'db',
      'coll',
      path.join(folder, 'coll.bson.gz')
    );
    cleanup.push(async () => {
      cursor.release();
      controller.abort();
      await result;
    });
    await cursor.entered;
    controller.abort();
    expect(await result).toMatchObject({ ok: false });
    expect(cursor.closed).toBe(true);
    expect(await readdir(folder)).toEqual([]);
  });

  it('rejects premature output closure and interrupts a pending read', async () => {
    const cursor = blockedCursor();
    const output = new Writable({ write: (_chunk, _encoding, done) => done() });
    output.on('error', () => {});
    const result = new MongoService().exportCollection(
      activeWith(cursor),
      'db',
      'coll',
      output,
      () => {},
      new AbortController().signal
    );
    cleanup.push(async () => {
      cursor.release();
      await result;
      output.destroy();
    });
    await cursor.entered;
    output.destroy();
    expect((await result).ok).toBe(false);
    expect(cursor.closed).toBe(true);
  });

  it('cancels compression finalization and closes streams before removing the partial file', async () => {
    const folder = await tempFolder();
    const controller = new AbortController();
    const sink = createFsSinkAdapter().writeGzipSink(path.join(folder, 'coll.bson.gz'), controller.signal);
    cleanup.push(() => sink.destroy());
    sink.writable.write(Buffer.alloc(128 * 1024, 42));
    const finishing = sink.finalize();
    controller.abort();
    await expect(finishing).rejects.toThrow();
    await sink.destroy();
    expect(sink.writable.destroyed).toBe(true);
    expect(await readdir(folder)).toEqual([]);
  });

  it('reports gzip failure instead of leaving finalization or the database read pending', async () => {
    const folder = await tempFolder();
    const ctx = context(new AbortController().signal, folder);
    const cursor = blockedCursor();
    const adapter = ctx.fs;
    const sink = adapter.writeGzipSink(path.join(folder, 'coll.bson.gz'), ctx.signal);
    ctx.fs = { ...adapter, writeGzipSink: () => sink };
    const result = exportOneCollection(ctx, activeWith(cursor), 'db', 'coll', path.join(folder, 'coll.bson.gz'));
    cleanup.push(async () => {
      cursor.release();
      await result;
      await sink.destroy();
    });
    await cursor.entered;
    sink.writable.destroy(new Error('compression failed'));
    expect(await result).toMatchObject({ ok: false, error: 'compression failed' });
    expect(cursor.closed).toBe(true);
    expect(await readdir(folder)).toEqual([]);
  });

  it('cancels pending index discovery without starting a sidecar or later collection', async () => {
    const folder = await tempFolder();
    const pending = blockedCursor();
    const controller = new AbortController();
    const collection = {
      ...collectionWith([{ _id: 'one' }]),
      listIndexes: (options: { signal: AbortSignal }) => {
        const cursor = pending.find({}, options);
        return {
          close: cursor.close,
          toArray: async () => {
            const indexes: object[] = [];
            for await (const index of cursor) indexes.push(index);
            return indexes;
          },
        };
      },
    };
    const active: ActiveConnection = {
      key: 'export-test',
      client: {
        db: () => ({
          listCollections: () => ({
            toArray: async () => [
              { name: 'first', type: 'collection' },
              { name: 'later', type: 'collection' },
            ],
            close: async () => {},
          }),
          collection: () => collection,
        }),
      } as unknown as MongoClient,
    };
    const result = exportDatabaseOp.run(
      active,
      { kind: 'export-database', db: 'db', collections: ['first', 'later'] },
      context(controller.signal, folder)
    );
    cleanup.push(async () => {
      pending.release();
      controller.abort();
      await result;
    });
    await pending.entered;
    controller.abort();
    expect(await result).toMatchObject({ ok: false });
    expect(pending.closed).toBe(true);
    expect(await readdir(folder)).toEqual(['first.bson.gz']);
    expect(gunzipSync(await readFile(path.join(folder, 'first.bson.gz')))).toEqual(BSON.serialize({ _id: 'one' }));
  });

  it('cancels pending collection discovery before creating any export files', async () => {
    const folder = await tempFolder();
    const pending = blockedCursor();
    const controller = new AbortController();
    const active: ActiveConnection = {
      key: 'export-test',
      client: {
        db: () => ({
          listCollections: (_filter: unknown, options: { signal: AbortSignal }) => {
            const cursor = pending.find({}, options);
            return {
              close: cursor.close,
              toArray: async () => {
                const collections: object[] = [];
                for await (const collection of cursor) collections.push(collection);
                return collections;
              },
            };
          },
        }),
      } as unknown as MongoClient,
    };
    const result = exportDatabaseOp.run(
      active,
      { kind: 'export-database', db: 'db', collections: ['first'] },
      context(controller.signal, folder)
    );
    cleanup.push(async () => {
      pending.release();
      controller.abort();
      await result;
    });
    await pending.entered;
    controller.abort();
    expect(await result).toMatchObject({ ok: false });
    expect(pending.closed).toBe(true);
    expect(await readdir(folder)).toEqual([]);
  });
});
