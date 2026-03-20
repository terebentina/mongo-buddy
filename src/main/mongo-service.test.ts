import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoService } from './mongo-service'

// Mock mongodb driver
vi.mock('mongodb', async () => {
  const actual = await vi.importActual<typeof import('mongodb')>('mongodb')
  return {
    ...actual,
    MongoClient: vi.fn()
  }
})

describe('MongoService', () => {
  let service: MongoService
  let mockClient: {
    connect: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    db: ReturnType<typeof vi.fn>
  }
  let mockDb: {
    listCollections: ReturnType<typeof vi.fn>
    collection: ReturnType<typeof vi.fn>
    admin: ReturnType<typeof vi.fn>
  }
  let mockCollection: {
    find: ReturnType<typeof vi.fn>
    countDocuments: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
    insertOne: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    replaceOne: ReturnType<typeof vi.fn>
    deleteOne: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockCollection = {
      find: vi.fn(),
      countDocuments: vi.fn(),
      aggregate: vi.fn(),
      insertOne: vi.fn(),
      findOne: vi.fn(),
      replaceOne: vi.fn(),
      deleteOne: vi.fn()
    }
    mockDb = {
      listCollections: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      collection: vi.fn().mockReturnValue(mockCollection),
      admin: vi.fn()
    }
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      db: vi.fn().mockReturnValue(mockDb)
    }
    mockDb.admin.mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue({
        databases: [
          { name: 'testdb', sizeOnDisk: 1024, empty: false },
          { name: 'admin', sizeOnDisk: 512, empty: false }
        ]
      })
    })
    vi.mocked(MongoClient).mockImplementation(() => mockClient as unknown as MongoClient)
    service = new MongoService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('connect', () => {
    it('calls MongoClient.connect with URI', async () => {
      const result = await service.connect('mongodb://localhost:27017')
      expect(MongoClient).toHaveBeenCalledWith('mongodb://localhost:27017')
      expect(mockClient.connect).toHaveBeenCalled()
      expect(result).toEqual({ ok: true, data: undefined })
    })

    it('with bad URI returns error result', async () => {
      mockClient.connect.mockRejectedValue(new Error('Invalid connection string'))
      const result = await service.connect('bad-uri')
      expect(result).toEqual({ ok: false, error: 'Invalid connection string' })
    })
  })

  describe('disconnect', () => {
    it('closes client', async () => {
      await service.connect('mongodb://localhost:27017')
      const result = await service.disconnect()
      expect(mockClient.close).toHaveBeenCalled()
      expect(result).toEqual({ ok: true, data: undefined })
    })
  })

  describe('listDatabases', () => {
    it('returns DbInfo[]', async () => {
      await service.connect('mongodb://localhost:27017')
      const result = await service.listDatabases()
      expect(result).toEqual({
        ok: true,
        data: [
          { name: 'testdb', sizeOnDisk: 1024, empty: false },
          { name: 'admin', sizeOnDisk: 512, empty: false }
        ]
      })
    })

    it('when not connected throws', async () => {
      const result = await service.listDatabases()
      expect(result).toEqual({ ok: false, error: 'Not connected' })
    })
  })

  describe('listCollections', () => {
    it('returns CollectionInfo[]', async () => {
      mockDb.listCollections.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' }
        ])
      })
      await service.connect('mongodb://localhost:27017')
      const result = await service.listCollections('testdb')
      expect(mockClient.db).toHaveBeenCalledWith('testdb')
      expect(result).toEqual({
        ok: true,
        data: [
          { name: 'users', type: 'collection' },
          { name: 'orders', type: 'collection' }
        ]
      })
    })
  })

  describe('find', () => {
    it('returns serialized docs + totalCount', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011')
      const date = new Date('2024-01-01T00:00:00.000Z')
      const docs = [
        { _id: objectId, name: 'Alice', createdAt: date },
        { _id: new ObjectId('507f1f77bcf86cd799439012'), name: 'Bob', createdAt: date }
      ]
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(docs)
      }
      mockCollection.find.mockReturnValue(mockCursor)
      mockCollection.countDocuments.mockResolvedValue(2)

      await service.connect('mongodb://localhost:27017')
      const result = await service.find('testdb', 'users', {
        filter: { name: 'Alice' },
        sort: { name: 1 },
        skip: 0,
        limit: 20
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.totalCount).toBe(2)
        expect(result.data.docs).toHaveLength(2)
        // EJSON serialization: ObjectId and Date should be serialized
        const doc = result.data.docs[0]
        expect(doc._id).toBeDefined()
        expect(doc.name).toBe('Alice')
      }
      expect(mockCollection.find).toHaveBeenCalledWith({ name: 'Alice' })
      expect(mockCursor.sort).toHaveBeenCalledWith({ name: 1 })
      expect(mockCursor.skip).toHaveBeenCalledWith(0)
      expect(mockCursor.limit).toHaveBeenCalledWith(20)
    })
  })

  describe('count', () => {
    it('returns number', async () => {
      mockCollection.countDocuments.mockResolvedValue(42)
      await service.connect('mongodb://localhost:27017')
      const result = await service.count('testdb', 'users', { active: true })
      expect(result).toEqual({ ok: true, data: 42 })
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({ active: true })
    })
  })

  describe('aggregate', () => {
    it('returns EJSON serialized docs from pipeline', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011')
      const docs = [{ _id: objectId, total: 100 }]
      const mockCursor = {
        toArray: vi.fn().mockResolvedValue(docs)
      }
      mockCollection.aggregate.mockReturnValue(mockCursor)

      await service.connect('mongodb://localhost:27017')
      const result = await service.aggregate('testdb', 'users', [{ $group: { _id: null, total: { $sum: 1 } } }])

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0]._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
        expect(result.data[0].total).toBe(100)
      }
      expect(mockCollection.aggregate).toHaveBeenCalledWith([{ $group: { _id: null, total: { $sum: 1 } } }])
    })

    it('returns error when not connected', async () => {
      const result = await service.aggregate('testdb', 'users', [])
      expect(result).toEqual({ ok: false, error: 'Not connected' })
    })
  })

  describe('insertOne', () => {
    it('inserts a document and returns EJSON serialized result', async () => {
      const insertedId = new ObjectId('507f1f77bcf86cd799439011')
      mockCollection.insertOne.mockResolvedValue({ insertedId })
      mockCollection.findOne.mockResolvedValue({ _id: insertedId, name: 'Alice' })

      await service.connect('mongodb://localhost:27017')
      const result = await service.insertOne('testdb', 'users', { name: 'Alice' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
        expect(result.data.name).toBe('Alice')
      }
      expect(mockCollection.insertOne).toHaveBeenCalled()
    })

    it('returns error when not connected', async () => {
      const result = await service.insertOne('testdb', 'users', { name: 'Alice' })
      expect(result).toEqual({ ok: false, error: 'Not connected' })
    })
  })

  describe('updateOne', () => {
    it('replaces document and returns EJSON serialized result', async () => {
      const oid = new ObjectId('507f1f77bcf86cd799439011')
      mockCollection.replaceOne.mockResolvedValue({ modifiedCount: 1 })
      mockCollection.findOne.mockResolvedValue({ _id: oid, name: 'Bob' })

      await service.connect('mongodb://localhost:27017')
      const result = await service.updateOne('testdb', 'users', '507f1f77bcf86cd799439011', { name: 'Bob' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
        expect(result.data.name).toBe('Bob')
      }
      expect(mockCollection.replaceOne).toHaveBeenCalled()
    })

    it('returns error when not connected', async () => {
      const result = await service.updateOne('testdb', 'users', '507f1f77bcf86cd799439011', { name: 'Bob' })
      expect(result).toEqual({ ok: false, error: 'Not connected' })
    })
  })

  describe('deleteOne', () => {
    it('deletes document by id', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })

      await service.connect('mongodb://localhost:27017')
      const result = await service.deleteOne('testdb', 'users', '507f1f77bcf86cd799439011')

      expect(result).toEqual({ ok: true, data: undefined })
      expect(mockCollection.deleteOne).toHaveBeenCalled()
    })

    it('returns error when not connected', async () => {
      const result = await service.deleteOne('testdb', 'users', '507f1f77bcf86cd799439011')
      expect(result).toEqual({ ok: false, error: 'Not connected' })
    })
  })

  describe('EJSON serialization', () => {
    it('ObjectId/Date round-trip correctly', async () => {
      const objectId = new ObjectId('507f1f77bcf86cd799439011')
      const date = new Date('2024-01-01T00:00:00.000Z')
      const docs = [{ _id: objectId, createdAt: date }]
      const mockCursor = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue(docs)
      }
      mockCollection.find.mockReturnValue(mockCursor)
      mockCollection.countDocuments.mockResolvedValue(1)

      await service.connect('mongodb://localhost:27017')
      const result = await service.find('testdb', 'users', {})

      expect(result.ok).toBe(true)
      if (result.ok) {
        const doc = result.data.docs[0]
        // EJSON serialized ObjectId should have $oid
        expect(doc._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
        // EJSON serialized Date should have $date
        expect(doc.createdAt).toEqual({ $date: '2024-01-01T00:00:00Z' })
      }
    })
  })
})
