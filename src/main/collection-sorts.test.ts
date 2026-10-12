import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MongoClient } from 'mongodb';
import { CollectionSortsStore } from './collection-sorts-store';
import { CollectionColumnWidthsStore } from './collection-column-widths-store';
import { createConnectionManager, type ActiveConnection } from './connection-manager';
import { connectionKeyFromUri } from './query-history-store';
import { registerIpcHandlers, type IpcDeps } from './ipc-handlers';
import type { Result, SaveCollectionSortInput } from '../shared/types';

const transport = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => Promise<Result<undefined>>>,
}));
vi.mock('electron', () => {
  const ipcMain = {
    on: vi.fn(),
    handle: (channel: string, handler: (...args: unknown[]) => Promise<Result<undefined>>) => {
      transport.handlers[channel] = handler;
    },
  };
  const app = { getPath: () => '/unused-test-preferences', getVersion: () => '1.0.0' };
  return { default: { ipcMain, app }, ipcMain, app, dialog: {}, BrowserWindow: {} };
});

let cwd: string;
let store: CollectionSortsStore;
let widths: CollectionColumnWidthsStore;
let active: ActiveConnection | null;
const key = 'db.example.test:27017';
const input: SaveCollectionSortInput = {
  connectionKey: key,
  db: 'sales',
  collection: 'orders',
  sort: { name: 1 },
};

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mongo-buddy-sorts-'));
  store = new CollectionSortsStore(cwd);
  widths = new CollectionColumnWidthsStore(cwd);
  active = { key, client: {} as MongoClient };
  registerIpcHandlers({
    connStore: {},
    historyStore: {},
    columnWidthsStore: widths,
    sortsStore: store,
    manager: { getActive: () => active, onStateChange: () => () => {} },
    registry: {},
    mcpStatus: { subscribe: () => () => {} },
    broadcast: () => {},
  } as unknown as IpcDeps);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function save(chosen: SaveCollectionSortInput): Promise<Result<undefined>> {
  return transport.handlers['collection-sorts:save']({}, chosen);
}

describe('collection sort preferences through the main boundary', () => {
  it('reopens literal sort preferences in isolated namespaces without changing column widths', async () => {
    widths.save({ connectionKey: key, db: 'sales', collection: 'orders', column: 'name', width: 240 });
    expect(store.getAll(key)).toEqual({});
    const choices: SaveCollectionSortInput[] = [
      input,
      { ...input, sort: { 'address.city': -1, name: 1, ['__proto__']: -1 } },
      { ...input, db: 'sales.orders', collection: 'archive', sort: { created: 1 } },
      { ...input, db: 'sales', collection: 'orders.archive', sort: { created: -1 } },
      { ...input, db: '__proto__', collection: 'a.b', sort: { ['constructor']: 1 as const } },
    ];
    for (const chosen of choices) expect(await save(chosen)).toEqual({ ok: true, data: undefined });
    for (const otherKey of ['db.example.test:27018', 'other.example.test:27017']) {
      active = { key: otherKey, client: {} as MongoClient };
      expect(await save({ ...input, connectionKey: otherKey, sort: { other: -1 } })).toEqual({
        ok: true,
        data: undefined,
      });
    }
    const reopened = new CollectionSortsStore(cwd);
    expect(reopened.getAll(key)).toEqual({
      '["sales","orders"]': { 'address.city': -1, name: 1, ['__proto__']: -1 },
      '["sales.orders","archive"]': { created: 1 },
      '["sales","orders.archive"]': { created: -1 },
      '["__proto__","a.b"]': { ['constructor']: 1 },
    });
    expect(reopened.getAll('db.example.test:27018')).toEqual({ '["sales","orders"]': { other: -1 } });
    expect(reopened.getAll('other.example.test:27017')).toEqual({ '["sales","orders"]': { other: -1 } });
    expect(reopened.getAll('unused:27017')).toEqual({});
    expect(new CollectionColumnWidthsStore(cwd).getAll(key)).toEqual({ '["sales","orders"]': { name: 240 } });
  });

  it('rejects stale and disconnected saves and clears without altering durable preferences', async () => {
    await save(input);
    active = { key: 'other:27017', client: {} as MongoClient };
    expect((await save({ ...input, sort: null })).ok).toBe(false);
    active = null;
    expect((await save({ ...input, sort: { name: -1 } })).ok).toBe(false);
    const reopened = new CollectionSortsStore(cwd);
    expect(reopened.getAll(key)).toEqual({ '["sales","orders"]': { name: 1 } });
    expect(reopened.getAll('other:27017')).toEqual({});
  });

  it('reports failed disk writes without replacing the last durable sort', async () => {
    await save(input);
    const file = join(cwd, 'collection-sorts.json');
    const previous = join(cwd, 'previous.json');
    renameSync(file, previous);
    mkdirSync(file);
    try {
      const failed = await save({ ...input, sort: null });
      expect(failed.ok).toBe(false);
      if (!failed.ok) expect(failed.error.length).toBeGreaterThan(0);
    } finally {
      rmSync(file, { recursive: true });
      renameSync(previous, file);
    }
    expect(new CollectionSortsStore(cwd).getAll(key)).toEqual({ '["sales","orders"]': { name: 1 } });
  });

  it('hydrates saved and cleared sorts after reconnecting with the same server identity', async () => {
    await save(input);
    widths.save({ connectionKey: key, db: 'sales', collection: 'orders', column: 'name', width: 240 });
    const client = {
      connect: async () => {},
      close: async () => {},
      db: () => ({ admin: () => ({ listDatabases: async () => ({ databases: [] }) }) }),
    } as unknown as MongoClient;
    const manager = createConnectionManager({
      clientFactory: { create: () => client },
      connectionStore: { setLastUsed: () => {} },
      historyStore: { getAll: () => [] },
      columnWidthsStore: new CollectionColumnWidthsStore(cwd),
      sortsStore: new CollectionSortsStore(cwd),
      connectionKeyFromUri,
    });
    for (const uri of ['mongodb://alice:secret@db.example.test:27017', 'mongodb://bob:other@db.example.test:27017']) {
      const connected = await manager.connect(uri);
      expect(connected.ok).toBe(true);
      if (connected.ok) {
        expect(connected.data.collectionSorts).toEqual({ '["sales","orders"]': { name: 1 } });
        expect(connected.data.collectionColumnWidths).toEqual({ '["sales","orders"]': { name: 240 } });
      }
      await manager.disconnect();
    }
    expect(await save({ ...input, sort: null })).toEqual({ ok: true, data: undefined });
    expect(new CollectionSortsStore(cwd).getAll(key)).toEqual({ '["sales","orders"]': null });
    const cleared = await manager.connect('mongodb://db.example.test:27017');
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.data.collectionSorts).toEqual({ '["sales","orders"]': null });
    await manager.disconnect();
  });
});
