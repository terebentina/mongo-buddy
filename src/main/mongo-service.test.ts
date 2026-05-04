import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MongoClient, MongoBulkWriteError, ObjectId } from 'mongodb';
import { BSON } from 'bson';
import { Readable, Writable } from 'stream';
import { MongoService } from './mongo-service';

describe('MongoService', () => {
  let service: MongoService;
  let mockClient: {
    close: ReturnType<typeof vi.fn>;
    db: ReturnType<typeof vi.fn>;
  };
  let mockDb: {
    listCollections: ReturnType<typeof vi.fn>;
    collection: ReturnType<typeof vi.fn>;
    admin: ReturnType<typeof vi.fn>;
    dropCollection: ReturnType<typeof vi.fn>;
    createCollection: ReturnType<typeof vi.fn>;
  };
  let mockCollection: {
    find: ReturnType<typeof vi.fn>;
    countDocuments: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    insertOne: ReturnType<typeof vi.fn>;
    insertMany: ReturnType<typeof vi.fn>;
    bulkWrite: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    replaceOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    distinct: ReturnType<typeof vi.fn>;
    indexes: ReturnType<typeof vi.fn>;
    dropIndex: ReturnType<typeof vi.fn>;
  };
  let requireClient: ReturnType<typeof vi.fn<() => MongoClient>>;

  beforeEach(() => {
    mockCollection = {
      find: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
      insertOne: vi.fn(),
      insertMany: vi.fn(),
      bulkWrite: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      findOne: vi.fn(),
      replaceOne: vi.fn(),
      deleteOne: vi.fn(),
      distinct: vi.fn(),
      indexes: vi.fn(),
      dropIndex: vi.fn().mockResolvedValue(undefined),
    };
    mockDb = {
      listCollections: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      collection: vi.fn().mockReturnValue(mockCollection),
      admin: vi.fn(),
      dropCollection: vi.fn().mockResolvedValue(undefined),
      createCollection: vi.fn().mockResolvedValue(undefined),
    };
    mockClient = {
      close: vi.fn().mockResolvedValue(undefined),
      db: vi.fn().mockReturnValue(mockDb),
    };
    mockDb.admin.mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue({
        databases: [
          { name: 'testdb', sizeOnDisk: 1024, empty: false },
          { name: 'admin', sizeOnDisk: 512, empty: false },
        ],
      }),
    });
    requireClient = vi.fn().mockReturnValue(mockClient as unknown as MongoClient);
    service = new MongoService({ conn: { requireClient: () => requireClient() } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listDatabases', () => {
    it('returns DbInfo[]', async () => {
      const result = await service.listDatabases();
      expect(result).toEqual({
        ok: true,
        data: [
          { name: 'testdb', sizeOnDisk: 1024, empty: false },
          { name: 'admin', sizeOnDisk: 512, empty: false },
        ],
      });
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.listDatabases();
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('listCollections', () => {
    it('returns CollectionInfo[]', async () => {
      mockDb.listCollections.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' },
        ]),
      });
      const result = await service.listCollections('testdb');
      expect(mockClient.db).toHaveBeenCalledWith('testdb');
      expect(result).toEqual({
        ok: true,
        data: [
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' },
        ],
      });
    });
  });

  describe('find', () => {
    it('returns serialized docs + totalCount', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011');
      const date = new Date('2024-01-01T00:00:00.000Z');
      const docs = [
        { _id: objectId, name: 'Alice', createdAt: date },
        { _id: new ObjectId('507f1f77bcf86cd799439012'), name: 'Bob', createdAt: date },
      ];
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(docs),
      };
      mockCollection.find.mockReturnValue(mockCursor);
      mockCollection.countDocuments.mockResolvedValue(2);

      const result = await service.find('testdb', 'users', {
        filter: { name: 'Alice' },
        sort: { name: 1 },
        skip: 0,
        limit: 20,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalCount).toBe(2);
        expect(result.data.docs).toHaveLength(2);
        const doc = result.data.docs[0];
        expect(doc._id).toBeDefined();
        expect(doc.name).toBe('Alice');
      }
      expect(mockCollection.find).toHaveBeenCalledWith({ name: 'Alice' });
      expect(mockCursor.sort).toHaveBeenCalledWith({ name: 1 });
      expect(mockCursor.skip).toHaveBeenCalledWith(0);
      expect(mockCursor.limit).toHaveBeenCalledWith(20);
    });

    it('deserializes EJSON $oid in filter to ObjectId', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      };
      mockCollection.find.mockReturnValue(mockCursor);
      mockCollection.countDocuments.mockResolvedValue(0);

      await service.find('testdb', 'users', {
        filter: { _id: { $oid: '507f1f77bcf86cd799439011' } },
      });

      expect(mockCollection.find).toHaveBeenCalledWith({ _id: oid });
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ _id: oid });
    });
  });

  describe('count', () => {
    it('returns number', async () => {
      mockCollection.countDocuments.mockResolvedValue(42);
      const result = await service.count('testdb', 'users', { active: true });
      expect(result).toEqual({ ok: true, data: 42 });
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ active: true });
    });

    it('deserializes EJSON $oid in filter to ObjectId', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.countDocuments.mockResolvedValue(1);
      await service.count('testdb', 'users', { _id: { $oid: '507f1f77bcf86cd799439011' } });
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ _id: oid });
    });
  });

  describe('aggregate', () => {
    it('returns EJSON serialized docs from pipeline', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011');
      const docs = [{ _id: objectId, total: 100 }];
      const mockCursor = {
        toArray: vi.fn().mockResolvedValue(docs),
      };
      mockCollection.aggregate.mockReturnValue(mockCursor);

      const result = await service.aggregate('testdb', 'users', [{ $group: { _id: null, total: { $sum: 1 } } }]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]._id).toEqual({ $oid: '507f1f77bcf86cd799439011' });
        expect(result.data[0].total).toBe(100);
      }
      expect(mockCollection.aggregate).toHaveBeenCalledWith([{ $group: { _id: null, total: { $sum: 1 } } }]);
    });

    it('deserializes EJSON $oid inside pipeline stages', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      const mockCursor = { toArray: vi.fn().mockResolvedValue([]) };
      mockCollection.aggregate.mockReturnValue(mockCursor);

      await service.aggregate('testdb', 'users', [{ $match: { _id: { $oid: '507f1f77bcf86cd799439011' } } }]);

      expect(mockCollection.aggregate).toHaveBeenCalledWith([{ $match: { _id: oid } }]);
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.aggregate('testdb', 'users', []);
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('insertOne', () => {
    it('inserts a document and returns EJSON serialized result', async () => {
      const insertedId = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.insertOne.mockResolvedValue({ insertedId });
      mockCollection.findOne.mockResolvedValue({ _id: insertedId, name: 'Alice' });

      const result = await service.insertOne('testdb', 'users', { name: 'Alice' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data._id).toEqual({ $oid: '507f1f77bcf86cd799439011' });
        expect(result.data.name).toBe('Alice');
      }
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.insertOne('testdb', 'users', { name: 'Alice' });
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('updateOne', () => {
    it('replaces document and returns EJSON serialized result', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.replaceOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.findOne.mockResolvedValue({ _id: oid, name: 'Bob' });

      const result = await service.updateOne('testdb', 'users', { $oid: '507f1f77bcf86cd799439011' }, { name: 'Bob' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data._id).toEqual({ $oid: '507f1f77bcf86cd799439011' });
        expect(result.data.name).toBe('Bob');
      }
      expect(mockCollection.replaceOne).toHaveBeenCalledWith({ _id: oid }, { name: 'Bob' });
    });

    it('with string id queries with string, not ObjectId', async () => {
      mockCollection.replaceOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.findOne.mockResolvedValue({ _id: 'my-string-id', name: 'Bob' });

      const result = await service.updateOne('testdb', 'users', 'my-string-id', { name: 'Bob' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe('Bob');
      }
      expect(mockCollection.replaceOne).toHaveBeenCalledWith({ _id: 'my-string-id' }, { name: 'Bob' });
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.updateOne('testdb', 'users', '507f1f77bcf86cd799439011', { name: 'Bob' });
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('deleteOne', () => {
    it('deletes document by ObjectId', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await service.deleteOne('testdb', 'users', { $oid: '507f1f77bcf86cd799439011' });

      expect(result).toEqual({ ok: true, data: undefined });
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: oid });
    });

    it('with string id queries with string, not ObjectId', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await service.deleteOne('testdb', 'users', 'my-string-id');

      expect(result).toEqual({ ok: true, data: undefined });
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: 'my-string-id' });
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.deleteOne('testdb', 'users', '507f1f77bcf86cd799439011');
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('distinct', () => {
    it('returns EJSON-serialized distinct values', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.distinct.mockResolvedValue([objectId, 'hello', 42]);

      const result = await service.distinct('testdb', 'users', 'status');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.values).toEqual([{ $oid: '507f1f77bcf86cd799439011' }, 'hello', 42]);
        expect(result.data.truncated).toBe(false);
      }
      expect(mockCollection.distinct).toHaveBeenCalledWith('status', {});
    });

    it('passes filter to collection.distinct when provided', async () => {
      mockCollection.distinct.mockResolvedValue(['active']);

      const result = await service.distinct('testdb', 'users', 'status', { age: { $gt: 18 } });

      expect(result.ok).toBe(true);
      expect(mockCollection.distinct).toHaveBeenCalledWith('status', { age: { $gt: 18 } });
    });

    it('deserializes EJSON $oid in filter to ObjectId', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011');
      mockCollection.distinct.mockResolvedValue([]);

      await service.distinct('testdb', 'users', 'status', { _id: { $oid: '507f1f77bcf86cd799439011' } });

      expect(mockCollection.distinct).toHaveBeenCalledWith('status', { _id: oid });
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.distinct('testdb', 'users', 'status');
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });

    it('truncates at maxValues and sets truncated to true', async () => {
      const values = Array.from({ length: 15 }, (_, i) => `val${i}`);
      mockCollection.distinct.mockResolvedValue(values);

      const result = await service.distinct('testdb', 'users', 'status', {}, 10);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.values).toHaveLength(10);
        expect(result.data.truncated).toBe(true);
      }
    });

    it('sets truncated to false when under limit', async () => {
      mockCollection.distinct.mockResolvedValue(['a', 'b', 'c']);

      const result = await service.distinct('testdb', 'users', 'status');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.truncated).toBe(false);
      }
    });

    it('handles MongoDB errors gracefully', async () => {
      mockCollection.distinct.mockRejectedValue(new Error('Query failed'));

      const result = await service.distinct('testdb', 'users', 'status');

      expect(result).toEqual({ ok: false, error: 'Query failed' });
    });
  });

  describe('dropCollections', () => {
    it('drops every name when all succeed', async () => {
      const result = await service.dropCollections('testdb', ['users', 'orders', 'logs']);

      expect(result).toEqual({
        ok: true,
        data: { dropped: ['users', 'orders', 'logs'], failed: [] },
      });
      expect(mockClient.db).toHaveBeenCalledWith('testdb');
      expect(mockDb.dropCollection).toHaveBeenCalledTimes(3);
      expect(mockDb.dropCollection).toHaveBeenNthCalledWith(1, 'users');
      expect(mockDb.dropCollection).toHaveBeenNthCalledWith(2, 'orders');
      expect(mockDb.dropCollection).toHaveBeenNthCalledWith(3, 'logs');
    });

    it('continues on error and lists failures separately', async () => {
      mockDb.dropCollection
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('not authorized'))
        .mockResolvedValueOnce(undefined);

      const result = await service.dropCollections('testdb', ['users', 'orders', 'logs']);

      expect(result).toEqual({
        ok: true,
        data: {
          dropped: ['users', 'logs'],
          failed: [{ name: 'orders', error: 'not authorized' }],
        },
      });
      expect(mockDb.dropCollection).toHaveBeenCalledTimes(3);
    });

    it('returns empty result for empty input without calling driver', async () => {
      const result = await service.dropCollections('testdb', []);

      expect(result).toEqual({ ok: true, data: { dropped: [], failed: [] } });
      expect(mockDb.dropCollection).not.toHaveBeenCalled();
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.dropCollections('testdb', ['users']);
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('exportCollection', () => {
    const makeCursor = (
      docs: Record<string, unknown>[]
    ): { close: ReturnType<typeof vi.fn>; [Symbol.asyncIterator]: () => AsyncGenerator<Record<string, unknown>> } => ({
      close: vi.fn().mockResolvedValue(undefined),
      [Symbol.asyncIterator]: async function* () {
        for (const doc of docs) yield doc;
      },
    });

    const collectingWritable = (): { writable: Writable; chunks: Buffer[] } => {
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
      });
      return { writable, chunks };
    };

    it('writes BSON-serialized docs to the provided Writable; count matches cursor size', async () => {
      const docs = [
        { _id: 'a', n: 1 },
        { _id: 'b', n: 2 },
        { _id: 'c', n: 3 },
      ];
      mockCollection.find.mockReturnValue(makeCursor(docs));
      const { writable, chunks } = collectingWritable();

      const result = await service.exportCollection('testdb', 'users', writable, vi.fn(), new AbortController().signal);

      expect(result).toEqual({ ok: true, data: 3 });
      expect(chunks).toHaveLength(3);
      expect(BSON.deserialize(chunks[0])).toEqual(docs[0]);
      expect(BSON.deserialize(chunks[1])).toEqual(docs[1]);
      expect(BSON.deserialize(chunks[2])).toEqual(docs[2]);
    });

    it('fires onProgress at 200ms throttle cadence during streaming', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({ n: i }));
      mockCollection.find.mockReturnValue(makeCursor(docs));
      const { writable } = collectingWritable();

      // lastProgressTime starts at 0. Check is: now - lastProgressTime >= 200.
      // times: 0, 100, 250, 300, 500
      // doc 1 (now=0): 0-0=0 → no
      // doc 2 (now=100): 100-0=100 → no
      // doc 3 (now=250): 250-0=250 → yes, progress(3), lastProgressTime=250
      // doc 4 (now=300): 300-250=50 → no
      // doc 5 (now=500): 500-250=250 → yes, progress(5), lastProgressTime=500
      // final: progress(5)
      const times = [0, 100, 250, 300, 500];
      let idx = 0;
      const spy = vi.spyOn(Date, 'now').mockImplementation(() => times[idx++] ?? 999);
      const onProgress = vi.fn();

      try {
        const result = await service.exportCollection(
          'testdb',
          'users',
          writable,
          onProgress,
          new AbortController().signal
        );
        expect(result).toEqual({ ok: true, data: 5 });
      } finally {
        spy.mockRestore();
      }

      // Throttled: exactly 2 mid-stream + 1 final = 3 calls
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 3);
      expect(onProgress).toHaveBeenNthCalledWith(2, 5);
      expect(onProgress).toHaveBeenNthCalledWith(3, 5);
    });

    it('fires a final onProgress(count) after the loop exits', async () => {
      const docs = [{ a: 1 }, { b: 2 }];
      mockCollection.find.mockReturnValue(makeCursor(docs));
      const { writable } = collectingWritable();
      // Keep now constant so mid-stream progress never fires; only final call.
      const spy = vi.spyOn(Date, 'now').mockReturnValue(0);
      const onProgress = vi.fn();

      try {
        await service.exportCollection('testdb', 'users', writable, onProgress, new AbortController().signal);
      } finally {
        spy.mockRestore();
      }

      expect(onProgress).toHaveBeenLastCalledWith(2);
    });

    it('aborts cleanly when signal.aborted is true mid-stream', async () => {
      const controller = new AbortController();
      const cursor = {
        close: vi.fn().mockResolvedValue(undefined),
        [Symbol.asyncIterator]: async function* () {
          yield { a: 1 };
          controller.abort();
          yield { a: 2 };
        },
      };
      mockCollection.find.mockReturnValue(cursor);
      const { writable } = collectingWritable();

      const result = await service.exportCollection('testdb', 'users', writable, vi.fn(), controller.signal);

      expect(result).toEqual({ ok: false, error: 'Export cancelled' });
      expect(cursor.close).toHaveBeenCalled();
    });

    it('returns error when not connected', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const { writable } = collectingWritable();
      const result = await service.exportCollection('testdb', 'users', writable, vi.fn(), new AbortController().signal);
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('importCollection', () => {
    const streamOf = (docs: Record<string, unknown>[]): Readable => {
      const buf = Buffer.concat(docs.map((d) => BSON.serialize(d)));
      return Readable.from([buf]);
    };

    it('reads BSON chunks and flushes batches at BATCH_SIZE', async () => {
      // 1500 docs → two flushes (1000 + 500)
      const docs = Array.from({ length: 1500 }, (_, i) => ({ n: i }));
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 1000 });

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf(docs),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result.ok).toBe(true);
      // Two flushes: one mid-loop (batch full at 1000), one final (remaining 500)
      expect(mockCollection.insertMany).toHaveBeenCalledTimes(2);
      expect(mockCollection.insertMany.mock.calls[0][0]).toHaveLength(1000);
      expect(mockCollection.insertMany.mock.calls[1][0]).toHaveLength(500);
    });

    it('fires a final onProgress(inserted + skipped) after the final flush', async () => {
      const docs = [{ a: 1 }, { b: 2 }];
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });
      const onProgress = vi.fn();

      await service.importCollection(
        'testdb',
        'users',
        streamOf(docs),
        { onDuplicate: 'fail', clearFirst: false },
        onProgress,
        new AbortController().signal
      );

      expect(onProgress).toHaveBeenLastCalledWith(2);
    });

    it('aborts cleanly mid-stream', async () => {
      const controller = new AbortController();
      async function* gen(): AsyncGenerator<Buffer> {
        yield Buffer.from(BSON.serialize({ a: 1 }));
        controller.abort();
        yield Buffer.from(BSON.serialize({ b: 2 }));
      }
      const stream = Readable.from(gen());
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 0 });

      const result = await service.importCollection(
        'testdb',
        'users',
        stream,
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        controller.signal
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Import cancelled/);
    });

    it('with onDuplicate=skip counts inserted + skipped correctly under MongoBulkWriteError', async () => {
      const docs = [{ a: 1 }, { b: 2 }, { c: 3 }];
      const err = Object.create(MongoBulkWriteError.prototype) as MongoBulkWriteError;
      // Minimal BulkWriteResult shape needed by importCollection's skip branch.
      (err as unknown as { result: { insertedCount: number } }).result = { insertedCount: 2 };
      mockCollection.insertMany.mockRejectedValue(err);

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf(docs),
        { onDuplicate: 'skip', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: true, data: { inserted: 2, skipped: 1 } });
      expect(mockCollection.insertMany).toHaveBeenCalledWith(expect.any(Array), { ordered: false });
    });

    it('with onDuplicate=fail surfaces the error and stops', async () => {
      const docs = [{ a: 1 }];
      mockCollection.insertMany.mockRejectedValue(new Error('duplicate key'));

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf(docs),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: false, error: 'duplicate key' });
    });

    it('with onDuplicate=upsert uses bulkWrite with upserts', async () => {
      const docs = [
        { _id: 1, v: 'a' },
        { _id: 2, v: 'b' },
      ];
      mockCollection.bulkWrite.mockResolvedValue({ upsertedCount: 1, modifiedCount: 1 });

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf(docs),
        { onDuplicate: 'upsert', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: true, data: { inserted: 2, skipped: 0 } });
      expect(mockCollection.bulkWrite).toHaveBeenCalled();
    });

    it('clearFirst=true calls deleteMany before streaming', async () => {
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      await service.importCollection(
        'testdb',
        'users',
        streamOf([{ a: 1 }]),
        { onDuplicate: 'fail', clearFirst: true },
        vi.fn(),
        new AbortController().signal
      );

      expect(mockCollection.deleteMany).toHaveBeenCalledWith({});
    });

    it('invalid BSON size returns error with offset and in-progress inserted count', async () => {
      // Buffer whose first 4 bytes encode a huge doc size > 16MB
      const badBuf = Buffer.alloc(8);
      badBuf.writeInt32LE(0x7fffffff, 0);
      const stream = Readable.from([badBuf]);

      const result = await service.importCollection(
        'testdb',
        'users',
        stream,
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Invalid BSON document size/);
        expect(result.error).toMatch(/offset 0/);
        expect(result.error).toMatch(/0 docs imported/);
      }
    });

    it('returns error when not connected', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf([{ a: 1 }]),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });

    it('calls db.createCollection at start, before deleteMany and insertMany', async () => {
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf([{ a: 1 }]),
        { onDuplicate: 'fail', clearFirst: true },
        vi.fn(),
        new AbortController().signal
      );

      expect(result.ok).toBe(true);
      expect(mockDb.createCollection).toHaveBeenCalledWith('users');
      const createOrder = mockDb.createCollection.mock.invocationCallOrder[0];
      const deleteOrder = mockCollection.deleteMany.mock.invocationCallOrder[0];
      const insertOrder = mockCollection.insertMany.mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(deleteOrder);
      expect(createOrder).toBeLessThan(insertOrder);
    });

    it('swallows NamespaceExists (code 48) from createCollection', async () => {
      mockDb.createCollection.mockRejectedValue(Object.assign(new Error('ns exists'), { code: 48 }));
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf([{ a: 1 }]),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: true, data: { inserted: 1, skipped: 0 } });
      expect(mockCollection.insertMany).toHaveBeenCalled();
    });

    it('propagates non-NamespaceExists errors from createCollection as failure', async () => {
      mockDb.createCollection.mockRejectedValue(new Error('boom'));

      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf([{ a: 1 }]),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: false, error: 'boom' });
      expect(mockCollection.insertMany).not.toHaveBeenCalled();
    });

    it('empty stream still creates the collection', async () => {
      const result = await service.importCollection(
        'testdb',
        'users',
        streamOf([]),
        { onDuplicate: 'fail', clearFirst: false },
        vi.fn(),
        new AbortController().signal
      );

      expect(result).toEqual({ ok: true, data: { inserted: 0, skipped: 0 } });
      expect(mockDb.createCollection).toHaveBeenCalledWith('users');
      expect(mockCollection.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('listIndexes', () => {
    it('returns EJSON-serialized index documents', async () => {
      const indexes = [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
      ];
      mockCollection.indexes.mockResolvedValue(indexes);

      const result = await service.listIndexes('testdb', 'users');

      expect(mockClient.db).toHaveBeenCalledWith('testdb');
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.indexes).toHaveBeenCalled();
      expect(result).toEqual({
        ok: true,
        data: [
          { v: 2, key: { _id: 1 }, name: '_id_' },
          { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
        ],
      });
    });

    it('preserves additional fields like partialFilterExpression and expireAfterSeconds', async () => {
      const indexes = [
        {
          v: 2,
          key: { createdAt: 1 },
          name: 'ttl_idx',
          expireAfterSeconds: 3600,
          partialFilterExpression: { archived: false },
        },
      ];
      mockCollection.indexes.mockResolvedValue(indexes);

      const result = await service.listIndexes('testdb', 'users');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].expireAfterSeconds).toBe(3600);
        expect(result.data[0].partialFilterExpression).toEqual({ archived: false });
      }
    });

    it('handles compound and special index types in keys', async () => {
      const indexes = [
        { v: 2, key: { lastName: 1, firstName: -1 }, name: 'name_compound' },
        { v: 2, key: { description: 'text' }, name: 'description_text' },
        { v: 2, key: { location: '2dsphere' }, name: 'location_2dsphere' },
      ];
      mockCollection.indexes.mockResolvedValue(indexes);

      const result = await service.listIndexes('testdb', 'places');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].key).toEqual({ lastName: 1, firstName: -1 });
        expect(result.data[1].key).toEqual({ description: 'text' });
        expect(result.data[2].key).toEqual({ location: '2dsphere' });
      }
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.listIndexes('testdb', 'users');
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });

    it('surfaces driver errors verbatim', async () => {
      mockCollection.indexes.mockRejectedValue(new Error('ns not found'));
      const result = await service.listIndexes('testdb', 'users');
      expect(result).toEqual({ ok: false, error: 'ns not found' });
    });
  });

  describe('dropIndex', () => {
    it('refuses to drop the _id_ index without calling the driver', async () => {
      const result = await service.dropIndex('testdb', 'users', '_id_');
      expect(result).toEqual({ ok: false, error: 'Cannot drop the _id_ index' });
      expect(mockCollection.dropIndex).not.toHaveBeenCalled();
    });

    it('drops the named index and returns ok', async () => {
      const result = await service.dropIndex('testdb', 'users', 'email_1');
      expect(mockClient.db).toHaveBeenCalledWith('testdb');
      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.dropIndex).toHaveBeenCalledWith('email_1');
      expect(result).toEqual({ ok: true, data: undefined });
    });

    it('surfaces driver errors verbatim', async () => {
      mockCollection.dropIndex.mockRejectedValue(new Error('index not found with name [foo]'));
      const result = await service.dropIndex('testdb', 'users', 'foo');
      expect(result).toEqual({ ok: false, error: 'index not found with name [foo]' });
    });

    it('when not connected returns error', async () => {
      requireClient.mockImplementation(() => {
        throw new Error('Not connected');
      });
      const result = await service.dropIndex('testdb', 'users', 'email_1');
      expect(result).toEqual({ ok: false, error: 'Not connected' });
    });
  });

  describe('EJSON serialization', () => {
    it('ObjectId/Date round-trip correctly', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011');
      const date = new Date('2024-01-01T00:00:00.000Z');
      const docs = [{ _id: objectId, createdAt: date }];
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(docs),
      };
      mockCollection.find.mockReturnValue(mockCursor);
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await service.find('testdb', 'users', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        const doc = result.data.docs[0];
        expect(doc._id).toEqual({ $oid: '507f1f77bcf86cd799439011' });
        expect(doc.createdAt).toEqual({ $date: '2024-01-01T00:00:00Z' });
      }
    });
  });
});
