import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { dropIndexCommand } from './drop-index';

describe('dropIndexCommand', () => {
  let mockCollection: { dropIndex: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { dropIndex: vi.fn().mockResolvedValue(undefined) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "dropIndex"', () => {
    expect(dropIndexCommand.name).toBe('dropIndex');
  });

  it('throws when indexName is _id_ without calling the driver', async () => {
    await expect(dropIndexCommand.run(active, { db: 'd', collection: 'c', indexName: '_id_' })).rejects.toThrow(
      'Cannot drop the _id_ index'
    );
    expect(mockCollection.dropIndex).not.toHaveBeenCalled();
  });

  it('drops the named index and returns undefined', async () => {
    const out = await dropIndexCommand.run(active, { db: 'd', collection: 'c', indexName: 'email_1' });
    expect(out).toBeUndefined();
    expect(mockCollection.dropIndex).toHaveBeenCalledWith('email_1');
  });

  it('schema requires indexName', () => {
    expect(dropIndexCommand.input.safeParse({ db: 'd', collection: 'c' }).success).toBe(false);
  });
});
