import ElectronStore from 'electron-store'
import type { SavedConnection } from '../shared/types'

export class ConnectionStore {
  private store: ElectronStore

  constructor() {
    this.store = new ElectronStore({
      encryptionKey: 'mongobuddy-saved-connections',
      name: 'saved-connections'
    })
  }

  getAll(): SavedConnection[] {
    return this.store.get('connections', []) as SavedConnection[]
  }

  save(conn: SavedConnection): void {
    const connections = this.getAll()
    const idx = connections.findIndex((c) => c.name === conn.name)
    if (idx >= 0) {
      connections[idx] = conn
    } else {
      connections.push(conn)
    }
    this.store.set('connections', connections)
  }

  remove(name: string): void {
    const connections = this.getAll().filter((c) => c.name !== name)
    this.store.set('connections', connections)
  }

  getLastUsed(): string | null {
    return (this.store.get('lastUsed', null) as string | null)
  }

  setLastUsed(uri: string): void {
    this.store.set('lastUsed', uri)
  }
}
