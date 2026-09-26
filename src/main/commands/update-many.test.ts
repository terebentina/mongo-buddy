import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { updateManyCommand } from './update-many';

describe('updateManyCommand', () => {
  let mockCollection: { updateMany: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockCollection = { updateMany: vi.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 2 }) };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('returns matched and modified counts without options', async () => {
    const out = await updateManyCommand.run(active, {
      db: 'd',
      collection: 'c',
      filter: { status: 'active' },
      update: { $set: { archived: true } },
    });
    expect(out).toEqual({ matchedCount: 3, modifiedCount: 2 });
  });

  it('schema accepts an update document or pipeline with optional object options', () => {
    expect(updateManyCommand.input.safeParse({ db: 'd', collection: 'c', update: { $set: {} } }).success).toBe(false);
    expect(updateManyCommand.input.safeParse({ db: 'd', collection: 'c', filter: {} }).success).toBe(false);
    expect(
      updateManyCommand.input.safeParse({ db: 'd', collection: 'c', filter: {}, update: { $set: { a: 1 } } }).success
    ).toBe(true);
    expect(
      updateManyCommand.input.safeParse({
        db: 'd',
        collection: 'c',
        filter: {},
        update: [{ $set: { 'data.name': '$title' } }],
      }).success
    ).toBe(true);
    expect(
      updateManyCommand.input.safeParse({
        db: 'd',
        collection: 'c',
        filter: {},
        update: { $set: { a: 1 } },
        options: { upsert: true, futureDriverOption: 'supported without an allowlist' },
      }).success
    ).toBe(true);
    expect(
      updateManyCommand.input.safeParse({
        db: 'd',
        collection: 'c',
        filter: {},
        update: { $set: { a: 1 } },
        options: [],
      }).success
    ).toBe(false);
    expect(updateManyCommand.input.safeParse({ db: 'd', collection: 'c', filter: {}, update: [1] }).success).toBe(
      false
    );
  });
});
