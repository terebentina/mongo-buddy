import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { dropCollectionsCommand } from './drop-collections';

describe('dropCollectionsCommand', () => {
  let mockDb: { dropCollection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockDb = { dropCollection: vi.fn().mockResolvedValue(true) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('drops all collections in order when each succeeds', async () => {
    const out = await dropCollectionsCommand.run(active, { db: 'd', names: ['users', 'orders', 'logs'] });
    expect(out).toEqual({ dropped: ['users', 'orders', 'logs'], failed: [] });
    expect(mockDb.dropCollection).toHaveBeenCalledTimes(3);
    expect(mockDb.dropCollection).toHaveBeenNthCalledWith(1, 'users');
    expect(mockDb.dropCollection).toHaveBeenNthCalledWith(2, 'orders');
    expect(mockDb.dropCollection).toHaveBeenNthCalledWith(3, 'logs');
  });

  it('continues past errors and reports failures separately', async () => {
    mockDb.dropCollection
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('not authorized'))
      .mockResolvedValueOnce(true);
    const out = await dropCollectionsCommand.run(active, { db: 'd', names: ['users', 'orders', 'logs'] });
    expect(out).toEqual({
      dropped: ['users', 'logs'],
      failed: [{ name: 'orders', error: 'not authorized' }],
    });
    expect(mockDb.dropCollection).toHaveBeenCalledTimes(3);
  });

  it('reports a false driver result as failed, without losing successful drops', async () => {
    mockDb.dropCollection.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const out = await dropCollectionsCommand.run(active, { db: 'd', names: ['users', 'missing'] });
    expect(out).toEqual({
      dropped: ['users'],
      failed: [{ name: 'missing', error: 'Collection was not dropped' }],
    });
  });

  it('returns empty result for empty input without calling driver', async () => {
    const out = await dropCollectionsCommand.run(active, { db: 'd', names: [] });
    expect(out).toEqual({ dropped: [], failed: [] });
    expect(mockDb.dropCollection).not.toHaveBeenCalled();
  });

  it('schema requires names array', () => {
    expect(dropCollectionsCommand.input.safeParse({ db: 'd' }).success).toBe(false);
  });
});
