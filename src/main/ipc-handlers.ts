import { ipcMain } from 'electron';
import type { MongoService } from './mongo-service';
import type { ConnectionStore } from './connection-store';
import type { Result, FindOpts, SavedConnection } from '../shared/types';

export function registerIpcHandlers(service: MongoService, connStore: ConnectionStore): void {
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

  ipcMain.handle(
    'mongo:connect',
    wrap((uri: unknown) => service.connect(uri as string))
  );
  ipcMain.handle(
    'mongo:disconnect',
    wrap(() => service.disconnect())
  );
  ipcMain.handle(
    'mongo:list-databases',
    wrap(() => service.listDatabases())
  );
  ipcMain.handle(
    'mongo:list-collections',
    wrap((db: unknown) => service.listCollections(db as string))
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
    'mongo:count',
    wrap((db: unknown, coll: unknown, filter: unknown) =>
      service.count(db as string, coll as string, filter as Record<string, unknown>)
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
      service.updateOne(db as string, coll as string, id as string, doc as Record<string, unknown>)
    )
  );
  ipcMain.handle(
    'mongo:delete-one',
    wrap((db: unknown, coll: unknown, id: unknown) => service.deleteOne(db as string, coll as string, id as string))
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
}
