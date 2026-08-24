import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { createCollectionCommand } from './create-collection';

describe('createCollectionCommand', () => {
  let mockDb: { createCollection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockDb = { createCollection: vi.fn().mockResolvedValue({}) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "createCollection"', () => {
    expect(createCollectionCommand.name).toBe('createCollection');
  });

  it('creates the named collection and returns undefined', async () => {
    const out = await createCollectionCommand.run(active, { db: 'd', collection: 'users' });
    expect(out).toBeUndefined();
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.createCollection).toHaveBeenCalledWith('users');
  });

  it('schema requires collection', () => {
    expect(createCollectionCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
