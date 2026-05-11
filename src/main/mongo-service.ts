import { MongoBulkWriteError } from 'mongodb';
import { BSON } from 'bson';
import type { Readable, Writable } from 'stream';
import type { ActiveConnection } from './connection-manager';
import type { Result, CollectionInfo, DropCollectionsResult, ImportOptions } from '../shared/types';
import type { IndexDescription } from 'mongodb';
import { pickIndexesToCreate, sanitizeForExport, type IndexSpec } from './index-spec';
import { listCollectionsImpl } from './commands/list-collections';

export class MongoService {
  async listCollections(active: ActiveConnection, dbName: string): Promise<Result<CollectionInfo[]>> {
    try {
      const data = await listCollectionsImpl(active, dbName);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async exportCollection(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    output: Writable,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<number>> {
    try {
      const collection = active.client.db(dbName).collection(collName);
      const cursor = collection.find({});
      let count = 0;
      let lastProgressTime = 0;

      for await (const doc of cursor) {
        if (signal.aborted) {
          await cursor.close();
          return { ok: false, error: 'Export cancelled' };
        }

        const buffer = BSON.serialize(doc);
        const canContinue = output.write(buffer);
        if (!canContinue) {
          await new Promise<void>((resolve) => output.once('drain', resolve));
        }

        count++;
        const now = Date.now();
        if (now - lastProgressTime >= 200) {
          lastProgressTime = now;
          onProgress(count);
        }
      }

      onProgress(count);
      return { ok: true, data: count };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async importCollection(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    input: Readable,
    options: ImportOptions,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<{ inserted: number; skipped: number }>> {
    try {
      const db = active.client.db(dbName);
      const collection = db.collection(collName);

      try {
        await db.createCollection(collName);
      } catch (err) {
        // 48 = NamespaceExists; collection already exists, which is fine.
        if ((err as { code?: unknown }).code !== 48) throw err;
      }

      if (options.clearFirst) {
        await collection.deleteMany({});
      }

      let inserted = 0;
      let skipped = 0;
      let batch: Record<string, unknown>[] = [];
      let leftover = Buffer.alloc(0);
      let lastProgressTime = 0;

      const BATCH_SIZE = 1000;
      const MAX_DOC_SIZE = 16 * 1024 * 1024; // 16 MB

      const flush = async (): Promise<void> => {
        if (batch.length === 0) return;

        if (options.onDuplicate === 'skip') {
          try {
            const result = await collection.insertMany(batch, { ordered: false });
            inserted += result.insertedCount;
          } catch (err) {
            if (err instanceof MongoBulkWriteError) {
              inserted += err.result.insertedCount;
              skipped += batch.length - err.result.insertedCount;
            } else {
              throw err;
            }
          }
        } else if (options.onDuplicate === 'fail') {
          const result = await collection.insertMany(batch, { ordered: true });
          inserted += result.insertedCount;
        } else {
          // upsert
          const ops = batch.map((doc) => ({
            replaceOne: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              filter: { _id: doc._id } as any,
              replacement: doc,
              upsert: true as const,
            },
          }));
          const result = await collection.bulkWrite(ops);
          inserted += result.upsertedCount + result.modifiedCount;
        }

        batch = [];
      };

      const reportProgress = (): void => {
        const now = Date.now();
        if (now - lastProgressTime >= 200) {
          lastProgressTime = now;
          onProgress(inserted + skipped);
        }
      };

      for await (const chunk of input) {
        if (signal.aborted) {
          return { ok: false, error: `Import cancelled (${inserted} docs imported)` };
        }

        leftover = Buffer.concat([leftover, chunk as Buffer]);
        let offset = 0;

        while (offset + 4 <= leftover.length) {
          const docSize = leftover.readInt32LE(offset);

          if (docSize < 5 || docSize > MAX_DOC_SIZE) {
            return {
              ok: false,
              error: `Invalid BSON document size ${docSize} at offset ${offset} (${inserted} docs imported)`,
            };
          }

          if (offset + docSize > leftover.length) break; // incomplete doc, wait for more data

          const docBuffer = leftover.subarray(offset, offset + docSize);
          const doc = BSON.deserialize(docBuffer) as Record<string, unknown>;
          batch.push(doc);
          offset += docSize;

          if (batch.length >= BATCH_SIZE) {
            await flush();
            reportProgress();

            if (signal.aborted) {
              return { ok: false, error: `Import cancelled (${inserted} docs imported)` };
            }
          }
        }

        leftover = leftover.subarray(offset);
      }

      await flush();
      onProgress(inserted + skipped);

      return { ok: true, data: { inserted, skipped } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async getExportableIndexes(active: ActiveConnection, dbName: string, collName: string): Promise<Result<IndexSpec[]>> {
    try {
      const collection = active.client.db(dbName).collection(collName);
      const rawIndexes = await collection.indexes();
      const data = sanitizeForExport(rawIndexes as Record<string, unknown>[]);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async applyImportedIndexes(
    active: ActiveConnection,
    dbName: string,
    collName: string,
    specs: IndexSpec[],
    opts: { dropExisting: boolean }
  ): Promise<Result<undefined>> {
    try {
      const collection = active.client.db(dbName).collection(collName);

      let toCreate: IndexSpec[];
      if (opts.dropExisting) {
        // dropIndexes() leaves the auto _id_ index alone.
        await collection.dropIndexes();
        toCreate = pickIndexesToCreate(specs, [], true);
      } else {
        const existing = await collection.indexes();
        const existingNames = existing
          .map((idx) => (idx as { name?: unknown }).name)
          .filter((n): n is string => typeof n === 'string');
        toCreate = pickIndexesToCreate(specs, existingNames, false);
      }

      if (toCreate.length > 0) {
        await collection.createIndexes(toCreate as unknown as IndexDescription[]);
      }
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async dropCollections(
    active: ActiveConnection,
    dbName: string,
    names: string[]
  ): Promise<Result<DropCollectionsResult>> {
    try {
      const db = active.client.db(dbName);
      const dropped: string[] = [];
      const failed: { name: string; error: string }[] = [];
      for (const name of names) {
        try {
          await db.dropCollection(name);
          dropped.push(name);
        } catch (err) {
          failed.push({ name, error: (err as Error).message });
        }
      }
      return { ok: true, data: { dropped, failed } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
