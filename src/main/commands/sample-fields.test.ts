import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { sampleFieldsCommand } from './sample-fields';

describe('sampleFieldsCommand', () => {
  let mockCursor: { limit: ReturnType<typeof vi.fn>; toArray: ReturnType<typeof vi.fn> };
  let mockCollection: { find: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCursor = { limit: vi.fn().mockReturnThis(), toArray: vi.fn() };
    mockCursor.limit = vi.fn().mockReturnValue(mockCursor);
    mockCollection = { find: vi.fn().mockReturnValue(mockCursor) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "sampleFields"', () => {
    expect(sampleFieldsCommand.name).toBe('sampleFields');
  });

  it('returns sorted union of top-level field names across up to 50 docs', async () => {
    mockCursor.toArray.mockResolvedValue([
      { _id: 1, name: 'a', age: 10 },
      { _id: 2, name: 'b', email: 'b@x' },
    ]);
    const out = await sampleFieldsCommand.run(active, { db: 'd', collection: 'c' });
    expect(out).toEqual(['_id', 'age', 'email', 'name']);
    expect(mockCollection.find).toHaveBeenCalledWith({});
    expect(mockCursor.limit).toHaveBeenCalledWith(50);
  });

  it('returns [] when collection is empty', async () => {
    mockCursor.toArray.mockResolvedValue([]);
    const out = await sampleFieldsCommand.run(active, { db: 'd', collection: 'c' });
    expect(out).toEqual([]);
  });

  it('schema rejects when collection is missing', () => {
    expect(sampleFieldsCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
