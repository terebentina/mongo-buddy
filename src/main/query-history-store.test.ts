import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryHistoryStore, connectionKeyFromUri } from './query-history-store';

vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      const data: Record<string, unknown> = {};
      return {
        get: vi.fn((key: string, defaultValue?: unknown) => (key in data ? data[key] : defaultValue)),
        set: vi.fn((key: string, value: unknown) => {
          data[key] = value;
        }),
        delete: vi.fn((key: string) => {
          delete data[key];
        }),
      };
    }),
  };
});

describe('connectionKeyFromUri', () => {
  it('extracts host:port from standard URI', () => {
    expect(connectionKeyFromUri('mongodb://localhost:27017')).toBe('localhost:27017');
  });

  it('extracts host:port stripping credentials', () => {
    expect(connectionKeyFromUri('mongodb://user:pass@myhost:9999/mydb')).toBe('myhost:9999');
  });

  it('handles SRV URIs', () => {
    expect(connectionKeyFromUri('mongodb+srv://cluster0.example.net')).toBe('cluster0.example.net');
  });

  it('falls back to localhost:27017 for invalid URIs', () => {
    expect(connectionKeyFromUri('not-a-uri')).toBe('localhost:27017');
  });
});

describe('QueryHistoryStore', () => {
  let store: QueryHistoryStore;
  const key = 'localhost:27017';

  const entry = {
    id: '1',
    queryMode: 'filter' as const,
    query: '{ name: "test" }',
    db: 'testdb',
    collection: 'users',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store = new QueryHistoryStore();
  });

  it('getAll returns empty array when nothing saved', () => {
    expect(store.getAll(key)).toEqual([]);
  });

  it('save + getAll roundtrip returns same entries', () => {
    const entries = [entry, { ...entry, id: '2', query: '{ age: 30 }' }];
    store.save(key, entries);
    expect(store.getAll(key)).toEqual(entries);
  });

  it('clear then getAll returns empty array', () => {
    store.save(key, [entry]);
    store.clear(key);
    expect(store.getAll(key)).toEqual([]);
  });

  it('different keys have independent history', () => {
    const otherKey = 'otherhost:27017';
    store.save(key, [entry]);
    store.save(otherKey, [{ ...entry, id: '2', query: '{ age: 30 }' }]);
    expect(store.getAll(key)).toHaveLength(1);
    expect(store.getAll(otherKey)).toHaveLength(1);
    expect(store.getAll(key)[0].id).toBe('1');
    expect(store.getAll(otherKey)[0].id).toBe('2');
  });
});
