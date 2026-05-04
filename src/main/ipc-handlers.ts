import { ipcMain, dialog } from 'electron';
import path from 'path';
import type { MongoService } from './mongo-service';
import type { ConnectionStore } from './connection-store';
import type { ConnectionManager, ConnectOptions } from './connection-manager';
import type { QueryHistoryStore } from './query-history-store';
import type { OperationRegistry } from './operation-registry';
import type { McpStatusEmitter } from './mcp/status';
import type {
  Result,
  FindOpts,
  SavedConnection,
  QueryHistoryEntry,
  PickedFile,
  OperationParams,
  OperationId,
  McpStatus,
  QueryMode,
} from '../shared/types';

export type Broadcast = (channel: string, payload: unknown) => void;

export interface IpcDeps {
  service: MongoService;
  connStore: ConnectionStore;
  historyStore: QueryHistoryStore;
  manager: ConnectionManager;
  registry: OperationRegistry;
  mcpStatus: McpStatusEmitter;
  broadcast?: Broadcast;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { service, connStore, historyStore, manager, registry, mcpStatus, broadcast = () => {} } = deps;

  const wrap = <T>(fn: (...args: unknown[]) => Promise<Result<T>>) => {
    return async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]): Promise<Result<T>> => {
      try {
        return await fn(...args);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    };
  };

  const wrapSync = <T>(fn: (...args: unknown[]) => T) => {
    return (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]): T => {
      return fn(...args);
    };
  };

  manager.onStateChange((state) => {
    broadcast('connection:state', state);
  });

  mcpStatus.subscribe((status) => {
    broadcast('mcp:status:update', status);
  });

  ipcMain.handle(
    'mcp:status:get',
    wrapSync((): McpStatus => mcpStatus.get())
  );

  ipcMain.handle(
    'mongo:connect',
    wrap((uri: unknown, opts: unknown) => manager.connect(uri as string, opts as ConnectOptions | undefined))
  );
  ipcMain.handle(
    'mongo:disconnect',
    wrap(() => manager.disconnect())
  );

  const requireConnectionKey = (): string => {
    const key = manager.getConnectionKey();
    if (!key) throw new Error('Not connected');
    return key;
  };
  ipcMain.handle(
    'mongo:list-databases',
    wrap(() => service.listDatabases())
  );
  ipcMain.handle(
    'mongo:list-collections',
    wrap((db: unknown) => service.listCollections(db as string))
  );
  ipcMain.handle(
    'mongo:list-indexes',
    wrap((db: unknown, coll: unknown) => service.listIndexes(db as string, coll as string))
  );
  ipcMain.handle(
    'mongo:find',
    wrap((db: unknown, coll: unknown, opts: unknown) => service.find(db as string, coll as string, opts as FindOpts))
  );
  ipcMain.handle(
    'mongo:aggregate',
    wrap((db: unknown, coll: unknown, pipeline: unknown) =>
      service.aggregate(db as string, coll as string, pipeline as Record<string, unknown>[])
    )
  );
  ipcMain.handle(
    'mongo:explain',
    wrap((db: unknown, coll: unknown, queryMode: unknown, query: unknown) =>
      service.explain(
        db as string,
        coll as string,
        queryMode as QueryMode,
        query as Record<string, unknown> | Record<string, unknown>[]
      )
    )
  );
  ipcMain.handle(
    'mongo:count',
    wrap((db: unknown, coll: unknown, filter: unknown) =>
      service.count(db as string, coll as string, filter as Record<string, unknown>)
    )
  );

  ipcMain.handle(
    'mongo:distinct',
    wrap((db: unknown, coll: unknown, field: unknown, filter: unknown) =>
      service.distinct(db as string, coll as string, field as string, filter as Record<string, unknown> | undefined)
    )
  );
  ipcMain.handle(
    'mongo:sample-fields',
    wrap((db: unknown, coll: unknown) => service.sampleFields(db as string, coll as string))
  );

  ipcMain.handle(
    'mongo:insert-one',
    wrap((db: unknown, coll: unknown, doc: unknown) =>
      service.insertOne(db as string, coll as string, doc as Record<string, unknown>)
    )
  );
  ipcMain.handle(
    'mongo:update-one',
    wrap((db: unknown, coll: unknown, id: unknown, doc: unknown) =>
      service.updateOne(db as string, coll as string, id, doc as Record<string, unknown>)
    )
  );
  ipcMain.handle(
    'mongo:delete-one',
    wrap((db: unknown, coll: unknown, id: unknown) => service.deleteOne(db as string, coll as string, id))
  );
  ipcMain.handle(
    'mongo:drop-index',
    wrap((db: unknown, coll: unknown, name: unknown) => service.dropIndex(db as string, coll as string, name as string))
  );
  ipcMain.handle(
    'mongo:drop-collection',
    wrap((db: unknown, coll: unknown) => service.dropCollection(db as string, coll as string))
  );
  ipcMain.handle(
    'mongo:drop-collections',
    wrap((db: unknown, names: unknown) => service.dropCollections(db as string, names as string[]))
  );

  ipcMain.handle(
    'connections:list',
    wrapSync(() => connStore.getAll())
  );
  ipcMain.handle(
    'connections:save',
    wrapSync((conn: unknown) => connStore.save(conn as SavedConnection))
  );
  ipcMain.handle(
    'connections:delete',
    wrapSync((name: unknown) => connStore.remove(name as string))
  );
  ipcMain.handle(
    'connections:get-last-used',
    wrapSync(() => connStore.getLastUsed())
  );
  ipcMain.handle(
    'connections:set-last-used',
    wrapSync((uri: unknown) => connStore.setLastUsed(uri as string))
  );

  ipcMain.handle(
    'history:load',
    wrapSync(() => historyStore.getAll(requireConnectionKey()))
  );
  ipcMain.handle(
    'history:save',
    wrapSync((entries: unknown) => historyStore.save(requireConnectionKey(), entries as QueryHistoryEntry[]))
  );
  ipcMain.handle(
    'history:clear',
    wrapSync(() => historyStore.clear(requireConnectionKey()))
  );

  ipcMain.handle('mongo:pick-import-file', async (): Promise<Result<PickedFile[] | null>> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'BSON Gzip', extensions: ['bson.gz'] }],
      properties: ['openFile', 'multiSelections'],
    });

    if (canceled || filePaths.length === 0) {
      return { ok: true, data: null };
    }

    const files = filePaths.map((fp) => ({
      filePath: fp,
      suggestedName: path.basename(fp, '.bson.gz'),
    }));

    return { ok: true, data: files };
  });

  ipcMain.handle(
    'operation:start',
    wrapSync((params: unknown): Result<OperationId> => registry.start(params as OperationParams))
  );
  ipcMain.handle(
    'operation:cancel',
    wrapSync((id: unknown): Result<undefined> => registry.cancel(id as OperationId))
  );
}
