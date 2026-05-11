import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { aggregateCommand } from './aggregate';

describe('aggregateCommand', () => {
  let mockCursor: { toArray: ReturnType<typeof vi.fn> };
  let mockCollection: { aggregate: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCursor = { toArray: vi.fn() };
    mockCollection = { aggregate: vi.fn().mockReturnValue(mockCursor) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "aggregate"', () => {
    expect(aggregateCommand.name).toBe('aggregate');
  });

  it('runs pipeline and returns raw docs (dispatcher serializes)', async () => {
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    const docs = [{ _id: oid, total: 100 }];
    mockCursor.toArray.mockResolvedValue(docs);
    const pipeline = [{ $group: { _id: null, total: { $sum: 1 } } }];
    const out = await aggregateCommand.run(active, { db: 'd', collection: 'c', pipeline });
    expect(out).toEqual(docs);
    expect(mockCollection.aggregate).toHaveBeenCalledWith(pipeline);
  });

  it('schema requires pipeline as an array of objects', () => {
    expect(aggregateCommand.input.safeParse({ db: 'd', collection: 'c' }).success).toBe(false);
    expect(aggregateCommand.input.safeParse({ db: 'd', collection: 'c', pipeline: [{}] }).success).toBe(true);
  });
});
