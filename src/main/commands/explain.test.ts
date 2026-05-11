import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { explainCommand } from './explain';

describe('explainCommand', () => {
  let mockExplain: ReturnType<typeof vi.fn>;
  let mockCursor: { explain: ReturnType<typeof vi.fn> };
  let mockCollection: { find: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  let mockDb: { collection: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockExplain = vi.fn();
    mockCursor = { explain: mockExplain };
    mockCollection = {
      find: vi.fn().mockReturnValue(mockCursor),
      aggregate: vi.fn().mockReturnValue(mockCursor),
    };
    mockDb = { collection: vi.fn().mockReturnValue(mockCollection) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "explain"', () => {
    expect(explainCommand.name).toBe('explain');
  });

  it('filter mode calls find(filter).explain("executionStats")', async () => {
    const plan = { queryPlanner: { winningPlan: { stage: 'IXSCAN' } } };
    mockExplain.mockResolvedValue(plan);
    const out = await explainCommand.run(active, {
      queryMode: 'filter',
      db: 'd',
      collection: 'c',
      query: { name: 'Alice' },
    });
    expect(out).toEqual(plan);
    expect(mockCollection.find).toHaveBeenCalledWith({ name: 'Alice' });
    expect(mockExplain).toHaveBeenCalledWith('executionStats');
  });

  it('aggregate mode calls aggregate(pipeline).explain("executionStats")', async () => {
    const plan = { stages: [] };
    mockExplain.mockResolvedValue(plan);
    const pipeline = [{ $match: { x: 1 } }];
    const out = await explainCommand.run(active, {
      queryMode: 'aggregate',
      db: 'd',
      collection: 'c',
      query: pipeline,
    });
    expect(out).toEqual(plan);
    expect(mockCollection.aggregate).toHaveBeenCalledWith(pipeline);
    expect(mockExplain).toHaveBeenCalledWith('executionStats');
  });

  it('schema accepts filter variant with object query', () => {
    expect(
      explainCommand.input.safeParse({ queryMode: 'filter', db: 'd', collection: 'c', query: { x: 1 } }).success
    ).toBe(true);
  });

  it('schema accepts aggregate variant with array query', () => {
    expect(
      explainCommand.input.safeParse({ queryMode: 'aggregate', db: 'd', collection: 'c', query: [{ $match: {} }] })
        .success
    ).toBe(true);
  });

  it('schema rejects filter variant with array query', () => {
    expect(explainCommand.input.safeParse({ queryMode: 'filter', db: 'd', collection: 'c', query: [{}] }).success).toBe(
      false
    );
  });
});
