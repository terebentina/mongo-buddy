import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { updateManyCommand } from './update-many';

describe('updateManyCommand', () => {
  let mockCollection: { updateMany: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { updateMany: vi.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 2 }) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "updateMany"', () => {
    expect(updateManyCommand.name).toBe('updateMany');
  });

  it('calls updateMany with the given filter and update, returns matched/modified counts', async () => {
    const out = await updateManyCommand.run(active, {
      db: 'd',
      collection: 'c',
      filter: { status: 'active' },
      update: { $set: { archived: true } },
    });
    expect(out).toEqual({ matchedCount: 3, modifiedCount: 2 });
    expect(mockCollection.updateMany).toHaveBeenCalledWith({ status: 'active' }, { $set: { archived: true } });
    expect(mockDb.collection).toHaveBeenCalledWith('c');
    expect(mockClient.db).toHaveBeenCalledWith('d');
  });

  it('schema requires filter and update', () => {
    expect(updateManyCommand.input.safeParse({ db: 'd', collection: 'c', update: { $set: {} } }).success).toBe(false);
    expect(updateManyCommand.input.safeParse({ db: 'd', collection: 'c', filter: {} }).success).toBe(false);
    expect(
      updateManyCommand.input.safeParse({ db: 'd', collection: 'c', filter: {}, update: { $set: { a: 1 } } }).success
    ).toBe(true);
  });
});
