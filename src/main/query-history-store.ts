import ElectronStore from 'electron-store';
import type { QueryHistoryEntry } from '../shared/types';

export function connectionKeyFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || 'localhost:27017';
  } catch {
    return 'localhost:27017';
  }
}

export class QueryHistoryStore {
  private store: ElectronStore;

  constructor() {
    this.store = new ElectronStore({
      name: 'query-history',
    });
  }

  getAll(key: string): QueryHistoryEntry[] {
    return this.store.get(key, []) as QueryHistoryEntry[];
  }

  save(key: string, entries: QueryHistoryEntry[]): void {
    this.store.set(key, entries);
  }

  clear(key: string): void {
    this.store.delete(key);
  }
}
