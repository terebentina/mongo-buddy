import { app, shell, BrowserWindow, Menu, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import appIcon from '../../resources/icon.png?asset';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { MongoClient } from 'mongodb';
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore, connectionKeyFromUri } from './query-history-store';
import { createConnectionManager } from './connection-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { createDispatcher } from './commands/dispatch';
import { countCommand } from './commands/count';
import { listDatabasesCommand } from './commands/list-databases';
import { sampleFieldsCommand } from './commands/sample-fields';
import { listCollectionsCommand } from './commands/list-collections';
import { listIndexesCommand } from './commands/list-indexes';
import { distinctCommand } from './commands/distinct';
import { findCommand } from './commands/find';
import { aggregateCommand } from './commands/aggregate';
import { explainCommand } from './commands/explain';
import { insertOneCommand } from './commands/insert-one';
import { updateOneCommand } from './commands/update-one';
import { deleteOneCommand } from './commands/delete-one';
import { dropIndexCommand } from './commands/drop-index';
import { dropCollectionCommand } from './commands/drop-collection';
import { renameCollectionCommand } from './commands/rename-collection';
import { emptyCollectionCommand } from './commands/empty-collection';
import { dropCollectionsCommand } from './commands/drop-collections';
import { registerMongoIpcCommands } from './ipc-mongo-adapter';
import { MCP_TOOLS } from './mcp/mongo-tool-entries';
import { createOperationRegistry } from './operation-registry';
import { OPERATIONS } from './operations';
import { createFsSinkAdapter } from './adapters/fs-sink';
import { createDialogProviderAdapter } from './adapters/dialog-provider';
import { parseMcpArgs } from './mcp/cli-args';
import { startMcpServer, type McpServerHandle } from './mcp/server';
import { createMcpStatusEmitter } from './mcp/status';
import { formatWindowTitle } from './window-title';

// Without fractional-scale-v1, Chromium renders at integer scale on Wayland and
// KWin resamples the buffer on fractional-scale displays (e.g. 125%), leaving
// text blurry/rough. Must be set before the app 'ready' event.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WaylandFractionalScaleV1');
}

const connectionStore = new ConnectionStore();
const queryHistoryStore = new QueryHistoryStore();
const connectionManager = createConnectionManager({
  clientFactory: { create: (uri: string) => new MongoClient(uri) },
  connectionStore,
  historyStore: queryHistoryStore,
  connectionKeyFromUri,
});
const mongoService = new MongoService();
const mcpArgs = parseMcpArgs(process.argv);
const mcpStatusEmitter = createMcpStatusEmitter();
let mcpHandle: McpServerHandle | null = null;
const broadcast = (channel: string, payload: unknown): void => {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
};
const operationRegistry = createOperationRegistry({
  mongo: mongoService,
  fs: createFsSinkAdapter(),
  dialog: createDialogProviderAdapter(),
  kinds: OPERATIONS,
  emit: (rec) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('operation:update', rec);
    }
  },
});
registerIpcHandlers({
  connStore: connectionStore,
  historyStore: queryHistoryStore,
  manager: connectionManager,
  registry: operationRegistry,
  mcpStatus: mcpStatusEmitter,
  broadcast,
});

const dispatch = createDispatcher(connectionManager);
const mongoCommands = [
  countCommand,
  listDatabasesCommand,
  sampleFieldsCommand,
  listCollectionsCommand,
  listIndexesCommand,
  distinctCommand,
  findCommand,
  aggregateCommand,
  explainCommand,
  insertOneCommand,
  updateOneCommand,
  deleteOneCommand,
  dropIndexCommand,
  dropCollectionCommand,
  renameCollectionCommand,
  emptyCollectionCommand,
  dropCollectionsCommand,
];
registerMongoIpcCommands({ ipcMain, dispatch, commands: mongoCommands });

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: formatWindowTitle('MongoBuddy', app.getVersion()),
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  });

  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mongobuddy');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (mcpArgs.enabled) {
    mcpHandle = await startMcpServer({
      dispatch,
      mongoTools: MCP_TOOLS,
      port: mcpArgs.port,
    });
    if (mcpHandle) {
      console.log(`MCP server listening on http://${mcpHandle.address}:${mcpHandle.actualPort}/mcp`);
      mcpStatusEmitter.set({ running: true, port: mcpHandle.actualPort });
    } else {
      console.error(`MCP failed to bind port ${mcpArgs.port}: see earlier error`);
    }
  } else {
    console.log('MCP server disabled');
  }
});

app.on('before-quit', () => {
  const handle = mcpHandle;
  mcpHandle = null;
  if (handle) {
    mcpStatusEmitter.set({ running: false, port: null });
    void handle.close().catch((err) => {
      console.error('MCP: error during shutdown:', err);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
