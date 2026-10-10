import ElectronStore from 'electron-store';
import type { ConnectionColumnWidths, SaveColumnWidthInput } from '../shared/types';
import { collectionColumnWidthsKey } from '../shared/collection-column-widths';

export class CollectionColumnWidthsStore {
  private store: ElectronStore<Record<string, ConnectionColumnWidths>>;

  constructor(cwd?: string) {
    this.store = new ElectronStore<Record<string, ConnectionColumnWidths>>({
      name: 'collection-column-widths',
      accessPropertiesByDotNotation: false,
      ...(cwd ? { cwd, projectVersion: '1.0.0' } : {}),
    });
  }

  getAll(key: string): ConnectionColumnWidths {
    return this.store.get(key, {});
  }

  save({ connectionKey, db, collection, column, width }: SaveColumnWidthInput): void {
    const namespaces = this.getAll(connectionKey);
    const namespace = collectionColumnWidthsKey(db, collection);
    this.store.set(connectionKey, {
      ...namespaces,
      [namespace]: { ...namespaces[namespace], [column]: width },
    });
  }
}
