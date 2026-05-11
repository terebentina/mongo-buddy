import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { distinctCommand } from './distinct';

describe('distinctCommand', () => {
  let mockCollection: { distinct: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { distinct: vi.fn() };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "distinct"', () => {
    expect(distinctCommand.name).toBe('distinct');
  });

  it('returns {values, truncated: false} when under cap', async () => {
    mockCollection.distinct.mockResolvedValue(['a', 'b', 'c']);
    const out = await distinctCommand.run(active, { db: 'd', collection: 'c', field: 'status' });
    expect(out).toEqual({ values: ['a', 'b', 'c'], truncated: false });
    expect(mockCollection.distinct).toHaveBeenCalledWith('status', {});
  });

  it('forwards filter to driver', async () => {
    mockCollection.distinct.mockResolvedValue([]);
    await distinctCommand.run(active, { db: 'd', collection: 'c', field: 'x', filter: { tier: 'gold' } });
    expect(mockCollection.distinct).toHaveBeenCalledWith('x', { tier: 'gold' });
  });

  it('truncates at 1000 and sets truncated=true', async () => {
    const big = Array.from({ length: 1500 }, (_, i) => i);
    mockCollection.distinct.mockResolvedValue(big);
    const out = await distinctCommand.run(active, { db: 'd', collection: 'c', field: 'n' });
    expect(out.truncated).toBe(true);
    expect(out.values).toHaveLength(1000);
    expect(out.values[0]).toBe(0);
    expect(out.values[999]).toBe(999);
  });

  it('schema requires field', () => {
    expect(distinctCommand.input.safeParse({ db: 'd', collection: 'c' }).success).toBe(false);
  });
});
