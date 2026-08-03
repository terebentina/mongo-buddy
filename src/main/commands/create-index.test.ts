import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { createIndexCommand } from './create-index';

describe('createIndexCommand', () => {
  let mockCollection: { createIndex: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { createIndex: vi.fn().mockResolvedValue('email_1') };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "createIndex"', () => {
    expect(createIndexCommand.name).toBe('createIndex');
  });

  it('creates a named unique index and returns its name', async () => {
    mockCollection.createIndex.mockResolvedValue('unique_email');
    const out = await createIndexCommand.run(active, {
      db: 'd',
      collection: 'c',
      key: { email: 1 },
      indexName: 'unique_email',
      unique: true,
    });

    expect(out).toBe('unique_email');
    expect(mockClient.db).toHaveBeenCalledWith('d');
    expect(mockDb.collection).toHaveBeenCalledWith('c');
    expect(mockCollection.createIndex).toHaveBeenCalledWith({ email: 1 }, { name: 'unique_email', unique: true });
  });

  it('lets MongoDB generate the index name', async () => {
    await createIndexCommand.run(active, {
      db: 'd',
      collection: 'c',
      key: { createdAt: -1, title: 'text' },
      unique: false,
    });

    expect(mockCollection.createIndex).toHaveBeenCalledWith({ createdAt: -1, title: 'text' }, { unique: false });
  });

  it('rejects an empty index key', () => {
    expect(createIndexCommand.input.safeParse({ db: 'd', collection: 'c', key: {}, unique: false }).success).toBe(
      false
    );
  });

  it('rejects a blank index name', () => {
    expect(
      createIndexCommand.input.safeParse({ db: 'd', collection: 'c', key: { email: 1 }, indexName: ' ', unique: false })
        .success
    ).toBe(false);
  });

  it('rejects an unsupported index direction', () => {
    expect(
      createIndexCommand.input.safeParse({ db: 'd', collection: 'c', key: { email: true }, unique: false }).success
    ).toBe(false);
  });
});
