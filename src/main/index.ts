import { app, shell, BrowserWindow, Menu } from 'electron';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { MongoClient } from 'mongodb';
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore, connectionKeyFromUri } from './query-history-store';
import { createConnectionManager } from './connection-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { createOperationRegistry } from './operation-registry';
import { createFsSinkAdapter } from './adapters/fs-sink';
import { createDialogProviderAdapter } from './adapters/dialog-provider';
import { parseMcpArgs } from './mcp/cli-args';
import { startMcpServer, type McpServerHandle } from './mcp/server';
import { createMcpStatusEmitter } from './mcp/status';
import { formatWindowTitle } from './window-title';

const connectionStore = new ConnectionStore();
const queryHistoryStore = new QueryHistoryStore();
const connectionManager = createConnectionManager({
  clientFactory: { create: (uri: string) => new MongoClient(uri) },
  connectionStore,
  historyStore: queryHistoryStore,
  connectionKeyFromUri,
});
const mongoService = new MongoService({ conn: connectionManager });
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
  emit: (rec) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('operation:update', rec);
    }
  },
});
registerIpcHandlers({
  service: mongoService,
  connStore: connectionStore,
  historyStore: queryHistoryStore,
  manager: connectionManager,
  registry: operationRegistry,
  mcpStatus: mcpStatusEmitter,
  broadcast,
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: formatWindowTitle('MongoBuddy', app.getVersion()),
    icon: resolve(__dirname, '../../build/icon.png'),
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
    mcpHandle = await startMcpServer({ service: mongoService, port: mcpArgs.port });
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
