import { ipcMain, dialog } from 'electron';
import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { createGunzip, createGzip } from 'zlib';
import type { MongoService } from './mongo-service';
import type { ConnectionStore } from './connection-store';
import type { ConnectionManager, ConnectOptions } from './connection-manager';
import type { QueryHistoryStore } from './query-history-store';
import type { Result, FindOpts, SavedConnection, QueryHistoryEntry, PickedFile, ImportOptions } from '../shared/types';

export type Broadcast = (channel: string, payload: unknown) => void;

export function registerIpcHandlers(
  service: MongoService,
  connStore: ConnectionStore,
  historyStore: QueryHistoryStore,
  manager: ConnectionManager,
  broadcast: Broadcast = () => {}
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

  manager.onStateChange((state) => {
    broadcast('connection:state', state);
  });

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
    'mongo:distinct',
    wrap((db: unknown, coll: unknown, field: unknown) =>
      service.distinct(db as string, coll as string, field as string)
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
    'mongo:drop-collection',
    wrap((db: unknown, coll: unknown) => service.dropCollection(db as string, coll as string))
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

  const activeDbExports = new Map<string, AbortController>();

  ipcMain.handle('mongo:export-database', async (event, db: string): Promise<Result<number | null>> => {
    if (activeDbExports.has(db)) {
      return { ok: false, error: 'Export already in progress for this database' };
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (canceled || filePaths.length === 0) {
      return { ok: true, data: null };
    }

    const folderPath = filePaths[0];
    const ac = new AbortController();
    activeDbExports.set(db, ac);

    try {
      const listResult = await service.listCollections(db);
      if (!listResult.ok) {
        activeDbExports.delete(db);
        return { ok: false, error: listResult.error };
      }

      const collections = listResult.data.filter((c) => c.type === 'collection');
      if (collections.length === 0) {
        activeDbExports.delete(db);
        return { ok: true, data: 0 };
      }

      let totalCount = 0;

      for (let i = 0; i < collections.length; i++) {
        if (ac.signal.aborted) break;

        const coll = collections[i];
        const filePath = path.join(folderPath, `${coll.name}.bson.gz`);
        const gzip = createGzip();
        const file = createWriteStream(filePath);
        gzip.pipe(file);

        const cleanupStreams = async (removeFile: boolean): Promise<void> => {
          gzip.destroy();
          file.destroy();
          if (removeFile) {
            await unlink(filePath).catch(() => {});
          }
        };

        try {
          const result = await service.exportCollection(
            db,
            coll.name,
            gzip,
            (count) => {
              event.sender.send('export-db:progress', {
                db,
                collection: coll.name,
                index: i,
                total: collections.length,
                count,
              });
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
            await cleanupStreams(false);
            totalCount += result.data;
          } else {
            await cleanupStreams(true);
            if (ac.signal.aborted) break;
            activeDbExports.delete(db);
            return result;
          }
        } catch (err) {
          await cleanupStreams(true);
          activeDbExports.delete(db);
          return { ok: false, error: (err as Error).message };
        }
      }

      activeDbExports.delete(db);
      return { ok: true, data: totalCount };
    } catch (err) {
      activeDbExports.delete(db);
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('mongo:cancel-export-database', (_event, db: string): Result<undefined> => {
    const ac = activeDbExports.get(db);
    if (!ac) {
      return { ok: false, error: 'No active database export for this database' };
    }
    ac.abort();
    return { ok: true, data: undefined };
  });

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

  const activeImports = new Map<string, AbortController>();

  ipcMain.handle(
    'mongo:import-collection',
    async (
      event,
      db: string,
      collection: string,
      filePath: string,
      options: ImportOptions
    ): Promise<Result<{ inserted: number; skipped: number } | null>> => {
      const key = `${db}.${collection}`;

      if (activeImports.has(key)) {
        return { ok: false, error: 'Import already in progress for this collection' };
      }

      const ac = new AbortController();
      activeImports.set(key, ac);

      const fileStream = createReadStream(filePath);
      const gunzip = createGunzip();
      const input = fileStream.pipe(gunzip);

      const cleanup = (): void => {
        activeImports.delete(key);
        fileStream.destroy();
        gunzip.destroy();
      };

      try {
        const result = await service.importCollection(
          db,
          collection,
          input,
          options,
          (count) => {
            event.sender.send('import:progress', { db, collection, count });
          },
          ac.signal
        );

        cleanup();
        return result;
      } catch (err) {
        cleanup();
        return { ok: false, error: (err as Error).message };
      }
    }
  );

  ipcMain.handle('mongo:cancel-import', (_event, db: string, collection: string): Result<undefined> => {
    const key = `${db}.${collection}`;
    const ac = activeImports.get(key);
    if (!ac) {
      return { ok: false, error: 'No active import for this collection' };
    }
    ac.abort();
    return { ok: true, data: undefined };
  });
}
