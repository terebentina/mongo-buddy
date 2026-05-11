import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { deleteOneCommand } from './delete-one';

describe('deleteOneCommand', () => {
  let mockCollection: { deleteOne: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "deleteOne"', () => {
    expect(deleteOneCommand.name).toBe('deleteOne');
  });

  it('deletes by ObjectId id', async () => {
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    await deleteOneCommand.run(active, { db: 'd', collection: 'c', id: oid });
    expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: oid });
  });

  it('deletes by string id', async () => {
    await deleteOneCommand.run(active, { db: 'd', collection: 'c', id: 'my-id' });
    expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: 'my-id' });
  });

  it('returns undefined on success', async () => {
    const out = await deleteOneCommand.run(active, { db: 'd', collection: 'c', id: 'x' });
    expect(out).toBeUndefined();
  });

  it('schema requires id', () => {
    expect(deleteOneCommand.input.safeParse({ db: 'd', collection: 'c' }).success).toBe(false);
  });
});
