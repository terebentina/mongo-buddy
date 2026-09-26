import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { countCommand } from './count';

describe('countCommand', () => {
  let mockCollection: { countDocuments: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { countDocuments: vi.fn() };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('returns the document count', async () => {
    mockCollection.countDocuments.mockResolvedValue(42);
    const out = await countCommand.run(active, { db: 'testdb', collection: 'users', filter: { active: true } });
    expect(out).toBe(42);
    expect(mockClient.db).toHaveBeenCalledWith('testdb');
    expect(mockDb.collection).toHaveBeenCalledWith('users');
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({ active: true });
  });

  it('defaults filter to {} when omitted', async () => {
    mockCollection.countDocuments.mockResolvedValue(7);
    const out = await countCommand.run(active, { db: 'testdb', collection: 'users' });
    expect(out).toBe(7);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
  });

  it('input schema rejects when db is missing', () => {
    const r = countCommand.input.safeParse({ collection: 'users' });
    expect(r.success).toBe(false);
  });
});
