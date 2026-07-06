import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { emptyCollectionCommand } from './empty-collection';

describe('emptyCollectionCommand', () => {
  let mockCollection: { deleteMany: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 3 }) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "emptyCollection"', () => {
    expect(emptyCollectionCommand.name).toBe('emptyCollection');
  });

  it('deletes all documents and returns the deleted count', async () => {
    const out = await emptyCollectionCommand.run(active, { db: 'd', collection: 'users' });
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.collection).toHaveBeenCalledWith('users');
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({});
    expect(out).toBe(3);
  });

  it('schema requires collection', () => {
    expect(emptyCollectionCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
