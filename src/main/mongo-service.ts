import { MongoBulkWriteError } from 'mongodb';
import { BSON, EJSON } from 'bson';
import type { Readable, Writable } from 'stream';
import type { ConnectionManager } from './connection-manager';
import type {
  Result,
  DbInfo,
  CollectionInfo,
  FindOpts,
  FindResult,
  ImportOptions,
  DistinctResult,
} from '../shared/types';

export interface MongoServiceDeps {
  conn: Pick<ConnectionManager, 'requireClient'>;
}

export class MongoService {
  private readonly conn: Pick<ConnectionManager, 'requireClient'>;

  constructor(deps: MongoServiceDeps) {
    this.conn = deps.conn;
  }

  async listDatabases(): Promise<Result<DbInfo[]>> {
    try {
      const client = this.conn.requireClient();
      const result = await client.db().admin().listDatabases();
      const databases: DbInfo[] = result.databases.map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk ?? 0,
        empty: db.empty ?? false,
      }));
      return { ok: true, data: databases };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async listCollections(dbName: string): Promise<Result<CollectionInfo[]>> {
    try {
      const client = this.conn.requireClient();
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      const data: CollectionInfo[] = await Promise.all(
        collections.map(async (c) => {
          let count: number | undefined;
          try {
            count = await db.collection(c.name).estimatedDocumentCount();
          } catch {
            // ignore count errors
          }
          return { name: c.name, type: c.type ?? 'collection', count };
        })
      );
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async find(dbName: string, collName: string, opts: FindOpts): Promise<Result<FindResult>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const filter = EJSON.deserialize(opts.filter ?? {}) as Record<string, unknown>;
      const cursor = collection.find(filter);
      if (opts.sort) cursor.sort(opts.sort);
      if (opts.skip !== undefined) cursor.skip(opts.skip);
      if (opts.limit !== undefined) cursor.limit(opts.limit);

      const [rawDocs, totalCount] = await Promise.all([cursor.toArray(), collection.countDocuments(filter)]);

      const docs = rawDocs.map((doc) => EJSON.serialize(doc) as Record<string, unknown>);

      return { ok: true, data: { docs, totalCount } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async aggregate(
    dbName: string,
    collName: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Result<Record<string, unknown>[]>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const deserializedPipeline = EJSON.deserialize(pipeline) as Record<string, unknown>[];
      const rawDocs = await collection.aggregate(deserializedPipeline).toArray();
      const docs = rawDocs.map((doc) => EJSON.serialize(doc) as Record<string, unknown>);
      return { ok: true, data: docs };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async count(dbName: string, collName: string, filter: Record<string, unknown> = {}): Promise<Result<number>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const deserialized = EJSON.deserialize(filter) as Record<string, unknown>;
      const count = await collection.countDocuments(deserialized);
      return { ok: true, data: count };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async insertOne(
    dbName: string,
    collName: string,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const deserialized = EJSON.deserialize(doc) as Record<string, unknown>;
      const result = await collection.insertOne(deserialized);
      const inserted = await collection.findOne({ _id: result.insertedId });
      return { ok: true, data: EJSON.serialize(inserted) as Record<string, unknown> };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async updateOne(
    dbName: string,
    collName: string,
    id: unknown,
    doc: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const deserialized = EJSON.deserialize(doc) as Record<string, unknown>;
      const { _id, ...updateFields } = deserialized;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filterid = (EJSON.deserialize({ _id: id }) as Record<string, unknown>)._id as any;
      await collection.replaceOne({ _id: filterid }, updateFields);
      const updated = await collection.findOne({ _id: filterid });
      return { ok: true, data: EJSON.serialize(updated) as Record<string, unknown> };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async sampleFields(dbName: string, collName: string): Promise<Result<string[]>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const docs = await collection.find({}).limit(50).toArray();
      const keySet = new Set<string>();
      for (const doc of docs) {
        for (const key of Object.keys(doc)) {
          keySet.add(key);
        }
      }
      const fields = Array.from(keySet).sort();
      return { ok: true, data: fields };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async exportCollection(
    dbName: string,
    collName: string,
    output: Writable,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<number>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
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
    dbName: string,
    collName: string,
    input: Readable,
    options: ImportOptions,
    onProgress: (count: number) => void,
    signal: AbortSignal
  ): Promise<Result<{ inserted: number; skipped: number }>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);

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

  async distinct(
    dbName: string,
    collName: string,
    field: string,
    filter: Record<string, unknown> = {},
    maxValues = 1000
  ): Promise<Result<DistinctResult>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      const deserialized = EJSON.deserialize(filter) as Record<string, unknown>;
      const rawValues = await collection.distinct(field, deserialized);
      const truncated = rawValues.length > maxValues;
      const sliced = truncated ? rawValues.slice(0, maxValues) : rawValues;
      const values = sliced.map((v) => EJSON.serialize(v));
      return { ok: true, data: { values, truncated } };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async dropCollection(dbName: string, collName: string): Promise<Result<undefined>> {
    try {
      const client = this.conn.requireClient();
      await client.db(dbName).dropCollection(collName);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async deleteOne(dbName: string, collName: string, id: unknown): Promise<Result<undefined>> {
    try {
      const client = this.conn.requireClient();
      const collection = client.db(dbName).collection(collName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filterid = (EJSON.deserialize({ _id: id }) as Record<string, unknown>)._id as any;
      await collection.deleteOne({ _id: filterid });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
