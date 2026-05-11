import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { insertOneCommand } from './insert-one';

describe('insertOneCommand', () => {
  let mockCollection: { insertOne: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { insertOne: vi.fn(), findOne: vi.fn() };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "insertOne"', () => {
    expect(insertOneCommand.name).toBe('insertOne');
  });

  it('inserts the doc and returns the round-tripped record', async () => {
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    mockCollection.insertOne.mockResolvedValue({ insertedId: oid });
    const stored = { _id: oid, name: 'Alice' };
    mockCollection.findOne.mockResolvedValue(stored);
    const out = await insertOneCommand.run(active, { db: 'd', collection: 'c', doc: { name: 'Alice' } });
    expect(out).toEqual(stored);
    expect(mockCollection.insertOne).toHaveBeenCalledWith({ name: 'Alice' });
    expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: oid });
  });

  it('schema requires doc', () => {
    expect(insertOneCommand.input.safeParse({ db: 'd', collection: 'c' }).success).toBe(false);
  });
});
