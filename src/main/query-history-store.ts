import ElectronStore from 'electron-store';
import type { QueryHistoryEntry } from '../shared/types';

export class QueryHistoryStore {
  private store: ElectronStore;

  constructor() {
    this.store = new ElectronStore({
      name: 'query-history',
    });
  }

  getAll(): QueryHistoryEntry[] {
    return this.store.get('entries', []) as QueryHistoryEntry[];
  }

  save(entries: QueryHistoryEntry[]): void {
    this.store.set('entries', entries);
  }

  clear(): void {
    this.store.delete('entries');
  }
}
