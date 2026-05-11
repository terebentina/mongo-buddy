import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { findCommand } from './find';

describe('findCommand', () => {
  let mockCursor: {
    sort: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    toArray: ReturnType<typeof vi.fn>;
  };
  let mockCollection: { find: ReturnType<typeof vi.fn>; countDocuments: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCursor = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn(),
    };
    mockCursor.sort = vi.fn().mockReturnValue(mockCursor);
    mockCursor.skip = vi.fn().mockReturnValue(mockCursor);
    mockCursor.limit = vi.fn().mockReturnValue(mockCursor);
    mockCollection = {
      find: vi.fn().mockReturnValue(mockCursor),
      countDocuments: vi.fn(),
    };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "find"', () => {
    expect(findCommand.name).toBe('find');
  });

  it('returns raw docs + totalCount (dispatcher serializes)', async () => {
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    const docs = [{ _id: oid, name: 'Alice' }];
    mockCursor.toArray.mockResolvedValue(docs);
    mockCollection.countDocuments.mockResolvedValue(1);
    const out = await findCommand.run(active, { db: 'd', collection: 'c', filter: { name: 'Alice' } });
    expect(out.docs).toEqual(docs);
    expect(out.totalCount).toBe(1);
    expect(mockCollection.find).toHaveBeenCalledWith({ name: 'Alice' });
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({ name: 'Alice' });
  });

  it('defaults filter to {} when omitted', async () => {
    mockCursor.toArray.mockResolvedValue([]);
    mockCollection.countDocuments.mockResolvedValue(0);
    await findCommand.run(active, { db: 'd', collection: 'c' });
    expect(mockCollection.find).toHaveBeenCalledWith({});
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({});
  });

  it('applies sort, skip, limit when provided', async () => {
    mockCursor.toArray.mockResolvedValue([]);
    mockCollection.countDocuments.mockResolvedValue(0);
    await findCommand.run(active, { db: 'd', collection: 'c', sort: { name: 1 }, skip: 10, limit: 20 });
    expect(mockCursor.sort).toHaveBeenCalledWith({ name: 1 });
    expect(mockCursor.skip).toHaveBeenCalledWith(10);
    expect(mockCursor.limit).toHaveBeenCalledWith(20);
  });

  it('does not apply skip/limit when undefined', async () => {
    mockCursor.toArray.mockResolvedValue([]);
    mockCollection.countDocuments.mockResolvedValue(0);
    await findCommand.run(active, { db: 'd', collection: 'c' });
    expect(mockCursor.sort).not.toHaveBeenCalled();
    expect(mockCursor.skip).not.toHaveBeenCalled();
    expect(mockCursor.limit).not.toHaveBeenCalled();
  });

  it('schema rejects when collection is missing', () => {
    expect(findCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
