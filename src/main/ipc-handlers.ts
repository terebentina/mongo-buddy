import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import path from 'path';
import type { ConnectionStore } from './connection-store';
import type { ActiveConnection, ConnectionManager, ConnectOptions } from './connection-manager';
import type { QueryHistoryStore } from './query-history-store';
import type { OperationRegistry } from './operation-registry';
import type { McpStatusEmitter } from './mcp/status';
import type {
  Result,
  SavedConnection,
  QueryHistoryEntry,
  PickedFile,
  OperationParams,
  OperationId,
  McpStatus,
  WindowColor,
} from '../shared/types';
import { WINDOW_COLORS } from '../shared/types';
import { formatWindowTitle } from './window-title';

export type Broadcast = (channel: string, payload: unknown) => void;

export interface IpcDeps {
  connStore: ConnectionStore;
  historyStore: QueryHistoryStore;
  manager: ConnectionManager;
  registry: OperationRegistry;
  mcpStatus: McpStatusEmitter;
  broadcast?: Broadcast;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { connStore, historyStore, manager, registry, mcpStatus, broadcast = () => {} } = deps;

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

  ipcMain.handle('window:set-title', (event, arg: unknown) => {
    const { color, location } = (arg ?? {}) as { color?: unknown; location?: unknown };
    const marker =
      typeof color === 'string' && (WINDOW_COLORS as readonly string[]).includes(color)
        ? (color as WindowColor)
        : undefined;
    const loc = typeof location === 'string' && location.length > 0 ? location : undefined;
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.setTitle(formatWindowTitle('MongoBuddy', app.getVersion(), { marker, location: loc }));
  });

  ipcMain.handle(
    'mongo:connect',
    wrap((uri: unknown, opts: unknown) => manager.connect(uri as string, opts as ConnectOptions | undefined))
  );
  ipcMain.handle(
    'mongo:disconnect',
    wrap(() => manager.disconnect())
  );

  const requireActive = (): ActiveConnection => {
    const active = manager.getActive();
    if (!active) throw new Error('Not connected');
    return active;
  };

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
    wrapSync(() => historyStore.getAll(requireActive().key))
  );
  ipcMain.handle(
    'history:save',
    wrapSync((entries: unknown) => historyStore.save(requireActive().key, entries as QueryHistoryEntry[]))
  );
  ipcMain.handle(
    'history:clear',
    wrapSync(() => historyStore.clear(requireActive().key))
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
    wrapSync((params: unknown): Result<OperationId> => {
      const active = manager.getActive();
      if (!active) return { ok: false, error: 'Not connected' };
      return registry.start(params as OperationParams, active);
    })
  );
  ipcMain.handle(
    'operation:cancel',
    wrapSync((id: unknown): Result<undefined> => registry.cancel(id as OperationId))
  );
}
