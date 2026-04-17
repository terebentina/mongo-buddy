import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';
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
  };
  let mockCollection: {
    find: ReturnType<typeof vi.fn>;
    countDocuments: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    insertOne: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    replaceOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    distinct: ReturnType<typeof vi.fn>;
  };
  let requireClient: ReturnType<typeof vi.fn<() => MongoClient>>;

  beforeEach(() => {
    mockCollection = {
      find: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
      insertOne: vi.fn(),
      findOne: vi.fn(),
      replaceOne: vi.fn(),
      deleteOne: vi.fn(),
      distinct: vi.fn(),
    };
    mockDb = {
      listCollections: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      collection: vi.fn().mockReturnValue(mockCollection),
      admin: vi.fn(),
      dropCollection: vi.fn().mockResolvedValue(undefined),
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
  });

  describe('count', () => {
    it('returns number', async () => {
      mockCollection.countDocuments.mockResolvedValue(42);
      const result = await service.count('testdb', 'users', { active: true });
      expect(result).toEqual({ ok: true, data: 42 });
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ active: true });
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
      expect(mockCollection.distinct).toHaveBeenCalledWith('status');
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

      const result = await service.distinct('testdb', 'users', 'status', 10);

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
