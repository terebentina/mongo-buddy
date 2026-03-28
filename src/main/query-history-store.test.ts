import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryHistoryStore } from './query-history-store';

vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => {
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

describe('QueryHistoryStore', () => {
  let store: QueryHistoryStore;

  const entry = {
    id: '1',
    type: 'filter' as const,
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
    expect(store.getAll()).toEqual([]);
  });

  it('save + getAll roundtrip returns same entries', () => {
    const entries = [entry, { ...entry, id: '2', query: '{ age: 30 }' }];
    store.save(entries);
    expect(store.getAll()).toEqual(entries);
  });

  it('clear then getAll returns empty array', () => {
    store.save([entry]);
    store.clear();
    expect(store.getAll()).toEqual([]);
  });
});
