import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { renameCollectionCommand } from './rename-collection';

describe('renameCollectionCommand', () => {
  let mockDb: { renameCollection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockDb = { renameCollection: vi.fn().mockResolvedValue(undefined) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "renameCollection"', () => {
    expect(renameCollectionCommand.name).toBe('renameCollection');
  });

  it('renames the collection within the same db and returns undefined', async () => {
    const out = await renameCollectionCommand.run(active, { db: 'd', from: 'users', to: 'members' });
    expect(out).toBeUndefined();
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.renameCollection).toHaveBeenCalledWith('users', 'members');
  });

  it('schema requires from', () => {
    expect(renameCollectionCommand.input.safeParse({ db: 'd', to: 'members' }).success).toBe(false);
  });

  it('schema requires to', () => {
    expect(renameCollectionCommand.input.safeParse({ db: 'd', from: 'users' }).success).toBe(false);
  });
});
