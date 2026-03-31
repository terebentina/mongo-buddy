import { app, shell, BrowserWindow, Menu } from 'electron';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { MongoService } from './mongo-service';
import { ConnectionStore } from './connection-store';
import { QueryHistoryStore } from './query-history-store';
import { registerIpcHandlers } from './ipc-handlers';

const mongoService = new MongoService();
const connectionStore = new ConnectionStore();
const queryHistoryStore = new QueryHistoryStore();
registerIpcHandlers(mongoService, connectionStore, queryHistoryStore);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: resolve(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mongobuddy');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
