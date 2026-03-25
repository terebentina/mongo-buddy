import { safeStorage } from 'electron';
import ElectronStore from 'electron-store';
import type { SavedConnection } from '../shared/types';

interface StoredConnection {
  name: string;
  uri: string;
}

export class ConnectionStore {
  private store: ElectronStore;

  constructor() {
    this.store = new ElectronStore({
      name: 'connections-v2',
    });
  }

  private encrypt(str: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption is not available');
    }
    const encrypted = safeStorage.encryptString(str);
    return 'enc:' + encrypted.toString('base64');
  }

  private decrypt(str: string): string {
    if (str.startsWith('enc:')) {
      const buffer = Buffer.from(str.slice(4), 'base64');
      return safeStorage.decryptString(buffer);
    }
    return str;
  }

  getRawConnections(): StoredConnection[] {
    return this.store.get('connections', []) as StoredConnection[];
  }

  getAll(): SavedConnection[] {
    if (!safeStorage.isEncryptionAvailable()) {
      return [];
    }
    const raw = this.getRawConnections();
    return raw.map((c) => ({ name: c.name, uri: this.decrypt(c.uri) }));
  }

  save(conn: SavedConnection): void {
    const connections = this.getRawConnections();
    const encrypted: StoredConnection = {
      name: conn.name,
      uri: this.encrypt(conn.uri),
    };
    const idx = connections.findIndex((c) => c.name === conn.name);
    if (idx >= 0) {
      connections[idx] = encrypted;
    } else {
      connections.push(encrypted);
    }
    this.store.set('connections', connections);
  }

  remove(name: string): void {
    const connections = this.getRawConnections().filter((c) => c.name !== name);
    this.store.set('connections', connections);
  }

  getLastUsed(): string | null {
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    const value = this.store.get('lastUsed', null) as string | null;
    if (value === null) return null;
    return this.decrypt(value);
  }

  setLastUsed(uri: string): void {
    this.store.set('lastUsed', this.encrypt(uri));
  }
}
