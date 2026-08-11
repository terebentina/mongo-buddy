import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { deleteManyCommand } from './delete-many';

describe('deleteManyCommand', () => {
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

  it('uses the exact filter and returns the driver deleted count', async () => {
    const filter = { status: 'inactive', attempts: { $gte: 3 } };

    const result = await deleteManyCommand.run(active, { db: 'd', collection: 'users', filter });

    expect(mockCollection.deleteMany).toHaveBeenCalledWith(filter);
    expect(mockDb.collection).toHaveBeenCalledWith('users');
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(result).toBe(3);
  });

  it('requires the database, collection, and filter', () => {
    expect(deleteManyCommand.input.safeParse({ db: 'd', collection: 'users', filter: {} }).success).toBe(true);
    expect(deleteManyCommand.input.safeParse({ db: 'd', collection: 'users' }).success).toBe(false);
  });
});
