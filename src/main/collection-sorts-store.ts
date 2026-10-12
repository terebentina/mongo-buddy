import ElectronStore from 'electron-store';
import type { ConnectionSorts, SaveCollectionSortInput } from '../shared/types';
import { collectionPreferencesKey } from '../shared/collection-preferences';

export class CollectionSortsStore {
  private store: ElectronStore<Record<string, ConnectionSorts>>;

  constructor(cwd?: string) {
    this.store = new ElectronStore<Record<string, ConnectionSorts>>({
      name: 'collection-sorts',
      accessPropertiesByDotNotation: false,
      cwd,
    });
  }

  getAll(key: string): ConnectionSorts {
    return this.store.get(key, {});
  }

  save({ connectionKey, db, collection, sort }: SaveCollectionSortInput): void {
    this.store.set(connectionKey, {
      ...this.getAll(connectionKey),
      [collectionPreferencesKey(db, collection)]: sort,
    });
  }
}
