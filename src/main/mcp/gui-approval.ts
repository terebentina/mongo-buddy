import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import type { ApprovalPrompt, WriteProposal } from './write-approval';

export function createGuiApproval(getWindow: () => BrowserWindow | null): ApprovalPrompt {
  const ready = new Set<WebContents>();
  ipcMain.on('mcp:approval:ready', (event) => {
    const window = getWindow();
    if (window && !window.isDestroyed() && event.sender === window.webContents) ready.add(event.sender);
  });

  return {
    request(proposal: WriteProposal, signal: AbortSignal): Promise<boolean> {
      const window = getWindow();
      if (!window || window.isDestroyed() || window.webContents.isDestroyed() || !ready.has(window.webContents)) {
        return Promise.reject(new Error('MongoBuddy GUI is unavailable'));
      }
      const sender = window.webContents;
      const id = randomUUID();
      return new Promise<boolean>((resolve, reject) => {
        const cleanup = (): void => {
          ipcMain.removeListener('mcp:approval:respond', onResponse);
          sender.removeListener('destroyed', onGone);
          sender.removeListener('render-process-gone', onGone);
          sender.removeListener('did-start-navigation', onGone);
          signal.removeEventListener('abort', onAbort);
          if (!sender.isDestroyed()) {
            try {
              sender.send('mcp:approval:clear', id);
            } catch {
              // A renderer may disappear between the destruction check and send.
            }
          }
        };
        const onResponse = (
          event: Electron.IpcMainEvent,
          responseId: unknown,
          decision: unknown,
          typedName: unknown
        ): void => {
          if (event.sender !== sender || responseId !== id || typeof decision !== 'boolean') return;
          cleanup();
          resolve(decision && (proposal.typeToConfirm === undefined || typedName === proposal.typeToConfirm));
        };
        const onGone = (): void => {
          ready.delete(sender);
          cleanup();
          reject(new Error('MongoBuddy GUI closed during approval'));
        };
        const onAbort = (): void => {
          cleanup();
          reject(new Error('Approval cancelled'));
        };
        ipcMain.on('mcp:approval:respond', onResponse);
        sender.once('destroyed', onGone);
        sender.once('render-process-gone', onGone);
        sender.once('did-start-navigation', onGone);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }
        try {
          window.show();
          window.focus();
          sender.send('mcp:approval:request', { id, ...proposal });
        } catch {
          cleanup();
          reject(new Error('MongoBuddy GUI is unavailable'));
        }
      });
    },
  };
}
