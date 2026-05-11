import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { dropCollectionCommand } from './drop-collection';

describe('dropCollectionCommand', () => {
  let mockDb: { dropCollection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockDb = { dropCollection: vi.fn().mockResolvedValue(undefined) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "dropCollection"', () => {
    expect(dropCollectionCommand.name).toBe('dropCollection');
  });

  it('drops the named collection and returns undefined', async () => {
    const out = await dropCollectionCommand.run(active, { db: 'd', collection: 'users' });
    expect(out).toBeUndefined();
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.dropCollection).toHaveBeenCalledWith('users');
  });

  it('schema requires collection', () => {
    expect(dropCollectionCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
