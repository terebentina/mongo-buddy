import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
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

  it('exposes name "count"', () => {
    expect(countCommand.name).toBe('count');
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

  it('passes already-deserialized filter through (dispatcher handles EJSON)', async () => {
    mockCollection.countDocuments.mockResolvedValue(1);
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    await countCommand.run(active, { db: 'testdb', collection: 'users', filter: { _id: oid } });
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({ _id: oid });
  });

  it('input schema rejects when db is missing', () => {
    const r = countCommand.input.safeParse({ collection: 'users' });
    expect(r.success).toBe(false);
  });

  it('input schema rejects when collection is missing', () => {
    const r = countCommand.input.safeParse({ db: 'testdb' });
    expect(r.success).toBe(false);
  });

  it('input schema accepts minimal valid input', () => {
    const r = countCommand.input.safeParse({ db: 'testdb', collection: 'users' });
    expect(r.success).toBe(true);
  });
});
