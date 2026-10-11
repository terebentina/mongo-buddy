import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MongoClient } from 'mongodb';
import { CollectionColumnWidthsStore } from './collection-column-widths-store';
import { createConnectionManager, type ActiveConnection } from './connection-manager';
import { connectionKeyFromUri } from './query-history-store';
import { registerIpcHandlers, type IpcDeps } from './ipc-handlers';
import type { Result, SaveColumnWidthInput } from '../shared/types';

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
let store: CollectionColumnWidthsStore;
let active: ActiveConnection | null;
const key = 'db.example.test:27017';
const input: SaveColumnWidthInput = {
  connectionKey: key,
  db: 'sales',
  collection: 'orders',
  column: 'name',
  width: 240,
};

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mongo-buddy-widths-'));
  store = new CollectionColumnWidthsStore(cwd);
  active = { key, client: {} as MongoClient };
  registerIpcHandlers({
    connStore: {},
    historyStore: {},
    columnWidthsStore: store,
    manager: { getActive: () => active, onStateChange: () => () => {} },
    registry: {},
    mcpStatus: { subscribe: () => () => {} },
    broadcast: () => {},
  } as unknown as IpcDeps);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function save(chosen: SaveColumnWidthInput): Promise<Result<undefined>> {
  return transport.handlers['column-widths:save']({}, chosen);
}

describe('collection column preferences through the main boundary', () => {
  it('reopens sparse literal preferences without mixing connections or colliding namespaces', async () => {
    expect(store.getAll(key)).toEqual({});
    for (const chosen of [
      input,
      { ...input, column: 'address.city', width: 180 },
      { ...input, column: 'address', width: 90 },
      { ...input, column: '__proto__', width: 40 },
      { ...input, width: 300 },
      { ...input, db: 'sales.orders', collection: 'archive', width: 101 },
      { ...input, db: 'sales', collection: 'orders.archive', width: 202 },
      { ...input, db: 'sales', collection: 'renamed', width: 303 },
    ]) {
      expect(await save(chosen)).toEqual({ ok: true, data: undefined });
    }
    active = { key: 'other.example.test:27017', client: {} as MongoClient };
    expect(await save({ ...input, connectionKey: active.key, width: 444 })).toEqual({ ok: true, data: undefined });
    const reopened = new CollectionColumnWidthsStore(cwd);
    expect(reopened.getAll(key)).toEqual({
      '["sales","orders"]': { name: 300, 'address.city': 180, address: 90, ['__proto__']: 40 },
      '["sales.orders","archive"]': { name: 101 },
      '["sales","orders.archive"]': { name: 202 },
      '["sales","renamed"]': { name: 303 },
    });
    expect(reopened.getAll('other.example.test:27017')).toEqual({ '["sales","orders"]': { name: 444 } });
    expect(reopened.getAll('unused:27017')).toEqual({});
  });

  it('rejects disconnected and stale requests without changing either connection on disk', async () => {
    await save(input);
    active = { key: 'other:27017', client: {} as MongoClient };
    expect((await save({ ...input, width: 500 })).ok).toBe(false);
    active = null;
    expect((await save({ ...input, width: 600 })).ok).toBe(false);
    const reopened = new CollectionColumnWidthsStore(cwd);
    expect(reopened.getAll(key)).toEqual({ '["sales","orders"]': { name: 240 } });
    expect(reopened.getAll('other:27017')).toEqual({});
  });

  it('reports a real filesystem failure and retains the last successful preference', async () => {
    await save(input);
    const file = join(cwd, 'collection-column-widths.json');
    const previous = join(cwd, 'previous.json');
    renameSync(file, previous);
    mkdirSync(file);
    try {
      const failed = await save({ ...input, width: 500 });
      expect(failed.ok).toBe(false);
      if (!failed.ok) expect(failed.error.length).toBeGreaterThan(0);
    } finally {
      rmSync(file, { recursive: true });
      renameSync(previous, file);
    }
    expect(new CollectionColumnWidthsStore(cwd).getAll(key)).toEqual({ '["sales","orders"]': { name: 240 } });
  });

  it('hydrates saved widths alongside history for saved connections sharing the unchanged server identity', async () => {
    await save(input);
    const history = [
      { id: '1', queryMode: 'filter' as const, query: '{}', db: 'sales', collection: 'orders', timestamp: 1 },
    ];
    const client = {
      connect: async () => {},
      close: async () => {},
      db: () => ({ admin: () => ({ listDatabases: async () => ({ databases: [] }) }) }),
    } as unknown as MongoClient;
    const manager = createConnectionManager({
      clientFactory: { create: () => client },
      connectionStore: { setLastUsed: () => {} },
      historyStore: { getAll: () => history },
      columnWidthsStore: new CollectionColumnWidthsStore(cwd),
      connectionKeyFromUri,
    });
    for (const uri of ['mongodb://alice:secret@db.example.test:27017', 'mongodb://bob:other@db.example.test:27017']) {
      const connected = await manager.connect(uri);
      expect(connected.ok).toBe(true);
      if (connected.ok) {
        expect(connected.data.collectionColumnWidths).toEqual({ '["sales","orders"]': { name: 240 } });
        expect(connected.data.queryHistory).toEqual(history);
      }
      await manager.disconnect();
    }
  });
});
