import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { updateOneCommand } from './update-one';

describe('updateOneCommand', () => {
  let mockCollection: { replaceOne: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { replaceOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }), findOne: vi.fn() };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "updateOne"', () => {
    expect(updateOneCommand.name).toBe('updateOne');
  });

  it('replaces by id, strips _id from update body, returns the updated doc', async () => {
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    mockCollection.findOne.mockResolvedValue({ _id: oid, name: 'Bob' });
    const out = await updateOneCommand.run(active, {
      db: 'd',
      collection: 'c',
      id: oid,
      doc: { _id: oid, name: 'Bob' },
    });
    expect(out).toEqual({ _id: oid, name: 'Bob' });
    expect(mockCollection.replaceOne).toHaveBeenCalledWith({ _id: oid }, { name: 'Bob' });
    expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: oid });
  });

  it('accepts string id (non-ObjectId)', async () => {
    mockCollection.findOne.mockResolvedValue({ _id: 'my-id', name: 'Bob' });
    await updateOneCommand.run(active, { db: 'd', collection: 'c', id: 'my-id', doc: { name: 'Bob' } });
    expect(mockCollection.replaceOne).toHaveBeenCalledWith({ _id: 'my-id' }, { name: 'Bob' });
  });

  it('schema requires id and doc', () => {
    expect(updateOneCommand.input.safeParse({ db: 'd', collection: 'c', id: 1 }).success).toBe(false);
    expect(updateOneCommand.input.safeParse({ db: 'd', collection: 'c', doc: {} }).success).toBe(false);
  });
});
