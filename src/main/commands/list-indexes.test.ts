import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { listIndexesCommand } from './list-indexes';

describe('listIndexesCommand', () => {
  let mockCollection: { indexes: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { indexes: vi.fn() };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "listIndexes"', () => {
    expect(listIndexesCommand.name).toBe('listIndexes');
  });

  it('returns raw index list from the driver (dispatcher serializes)', async () => {
    const raw = [
      { v: 2, key: { _id: 1 }, name: '_id_' },
      { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
    ];
    mockCollection.indexes.mockResolvedValue(raw);
    const out = await listIndexesCommand.run(active, { db: 'd', collection: 'c' });
    expect(out).toEqual(raw);
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.collection).toHaveBeenCalledWith('c');
  });

  it('schema rejects when collection is missing', () => {
    expect(listIndexesCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
