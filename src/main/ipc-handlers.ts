import { ipcMain, dialog } from 'electron';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { createGzip } from 'zlib';
import type { MongoService } from './mongo-service';
import type { ConnectionStore } from './connection-store';
import type { QueryHistoryStore } from './query-history-store';
import type { Result, FindOpts, SavedConnection, QueryHistoryEntry } from '../shared/types';

export function registerIpcHandlers(
  service: MongoService,
  connStore: ConnectionStore,
  historyStore: QueryHistoryStore
): void {
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
      service.updateOne(db as string, coll as string, id, doc as Record<string, unknown>)
    )
  );
  ipcMain.handle(
    'mongo:delete-one',
    wrap((db: unknown, coll: unknown, id: unknown) => service.deleteOne(db as string, coll as string, id))
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
    wrapSync(() => historyStore.getAll())
  );
  ipcMain.handle(
    'history:save',
    wrapSync((entries: unknown) => historyStore.save(entries as QueryHistoryEntry[]))
  );
  ipcMain.handle(
    'history:clear',
    wrapSync(() => historyStore.clear())
  );

  const activeExports = new Map<string, AbortController>();

  ipcMain.handle(
    'mongo:export-collection',
    async (event, db: string, collection: string): Promise<Result<number | null>> => {
      const key = `${db}.${collection}`;

      if (activeExports.has(key)) {
        return { ok: false, error: 'Export already in progress for this collection' };
      }

      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `${collection}.bson.gz`,
        filters: [{ name: 'BSON Gzip', extensions: ['bson.gz'] }],
      });

      if (canceled || !filePath) {
        return { ok: true, data: null };
      }

      const ac = new AbortController();
      activeExports.set(key, ac);

      const gzip = createGzip();
      const file = createWriteStream(filePath);
      gzip.pipe(file);

      const cleanup = async (removeFile: boolean): Promise<void> => {
        activeExports.delete(key);
        gzip.destroy();
        file.destroy();
        if (removeFile) {
          await unlink(filePath).catch(() => {});
        }
      };

      try {
        const result = await service.exportCollection(
          db,
          collection,
          gzip,
          (count) => {
            event.sender.send('export:progress', { db, collection, count });
          },
          ac.signal
        );

        if (result.ok) {
          await new Promise<void>((resolve, reject) => {
            gzip.end(() => {
              file.on('finish', resolve);
              file.on('error', reject);
            });
          });
          await cleanup(false);
          return result;
        }

        await cleanup(true);
        return result;
      } catch (err) {
        await cleanup(true);
        return { ok: false, error: (err as Error).message };
      }
    }
  );

  ipcMain.handle('mongo:cancel-export', (_event, db: string, collection: string): Result<undefined> => {
    const key = `${db}.${collection}`;
    const ac = activeExports.get(key);
    if (!ac) {
      return { ok: false, error: 'No active export for this collection' };
    }
    ac.abort();
    return { ok: true, data: undefined };
  });
}
