import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { listCollectionsCommand, listCollectionsImpl } from './list-collections';

function setup(): {
  active: ActiveConnection;
  mockDb: { listCollections: ReturnType<typeof vi.fn>; collection: ReturnType<typeof vi.fn> };
  setCollections: (entries: { name: string; type?: string }[]) => void;
  setCount: (name: string, value: number | Error) => void;
} {
  const counts = new Map<string, number | Error>();
  const mockDb = {
    listCollections: vi.fn(),
    collection: vi.fn((name: string) => ({
      estimatedDocumentCount: vi.fn(() => {
        const v = counts.get(name);
        if (v instanceof Error) return Promise.reject(v);
        return Promise.resolve(v ?? 0);
      }),
    })),
  };
  const mockClient = { db: vi.fn().mockReturnValue(mockDb) };
  const active: ActiveConnection = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  return {
    active,
    mockDb,
    setCollections: (entries) => {
      mockDb.listCollections.mockReturnValue({ toArray: vi.fn().mockResolvedValue(entries) });
    },
    setCount: (name, value) => counts.set(name, value),
  };
}

describe('listCollectionsCommand', () => {
  it('exposes name "listCollections"', () => {
    expect(listCollectionsCommand.name).toBe('listCollections');
  });

  it('schema rejects when db is missing', () => {
    expect(listCollectionsCommand.input.safeParse({}).success).toBe(false);
  });

  it('delegates to listCollectionsImpl with active and db', async () => {
    const { active, setCollections } = setup();
    setCollections([{ name: 'users', type: 'collection' }]);
    const out = await listCollectionsCommand.run(active, { db: 'testdb' });
    expect(out).toEqual([{ name: 'users', type: 'collection', count: 0 }]);
  });
});

describe('listCollectionsImpl', () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it('returns CollectionInfo[] sorted alphabetically', async () => {
    env.setCollections([
      { name: 'users', type: 'collection' },
      { name: 'orders', type: 'collection' },
    ]);
    const out = await listCollectionsImpl(env.active, 'testdb');
    expect(out.map((c) => c.name)).toEqual(['orders', 'users']);
  });

  it('defaults type to "collection" when missing', async () => {
    env.setCollections([{ name: 'x' }]);
    const out = await listCollectionsImpl(env.active, 'testdb');
    expect(out[0].type).toBe('collection');
  });

  it('includes estimated document count', async () => {
    env.setCollections([{ name: 'users', type: 'collection' }]);
    env.setCount('users', 42);
    const out = await listCollectionsImpl(env.active, 'testdb');
    expect(out[0].count).toBe(42);
  });

  it('leaves count undefined when estimatedDocumentCount throws', async () => {
    env.setCollections([{ name: 'users', type: 'collection' }]);
    env.setCount('users', new Error('view has no count'));
    const out = await listCollectionsImpl(env.active, 'testdb');
    expect(out[0].count).toBeUndefined();
  });

  it('sorts case-insensitively with numeric ordering', async () => {
    env.setCollections([
      { name: 'log10', type: 'collection' },
      { name: 'Users_2', type: 'collection' },
      { name: 'log2', type: 'collection' },
      { name: 'users_10', type: 'collection' },
    ]);
    const out = await listCollectionsImpl(env.active, 'testdb');
    expect(out.map((c) => c.name)).toEqual(['log2', 'log10', 'Users_2', 'users_10']);
  });
});
