import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserWindow, WebContents } from 'electron';
import { ipcMain } from 'electron';
import { createGuiApproval } from './gui-approval';
import type { WriteProposal } from './write-approval';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { ipcMain: new EventEmitter() };
});

const proposal: WriteProposal = {
  command: 'insertOne',
  connection: 'localhost:27161',
  db: 'sandbox',
  collection: 'notes',
  input: '{"doc":{"name":"review"}}',
};

afterEach(() => {
  (ipcMain as unknown as EventEmitter).removeAllListeners();
});

function gui() {
  const sender = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false });
  const window = {
    webContents: sender as unknown as WebContents,
    isDestroyed: () => false,
    show: vi.fn(),
    focus: vi.fn(),
  } as unknown as BrowserWindow;
  return { sender, window };
}

describe('main-process GUI approval prompt', () => {
  it('requires a ready local GUI; rejects when it is absent', async () => {
    const { window } = gui();
    const prompt = createGuiApproval(() => window);
    await expect(prompt.request(proposal, new AbortController().signal)).rejects.toThrow('GUI is unavailable');
    const missing = createGuiApproval(() => null);
    await expect(missing.request(proposal, new AbortController().signal)).rejects.toThrow('GUI is unavailable');
  });

  it('accepts only one explicit response from the displayed webContents and exact request id', async () => {
    const { sender, window } = gui();
    const events = ipcMain as unknown as EventEmitter;
    const prompt = createGuiApproval(() => window);
    events.emit('mcp:approval:ready', { sender });
    const decision = prompt.request(proposal, new AbortController().signal);
    const [channel, request] = sender.send.mock.calls[0];
    expect(channel).toBe('mcp:approval:request');
    expect(request).toMatchObject(proposal);
    expect(request.id).toEqual(expect.any(String));
    events.emit('mcp:approval:respond', { sender: new EventEmitter() }, request.id, true);
    events.emit('mcp:approval:respond', { sender }, 'wrong-id', true);
    expect(events.listenerCount('mcp:approval:respond')).toBe(1);
    events.emit('mcp:approval:respond', { sender }, request.id, true);
    expect(await decision).toBe(true);
    expect(events.listenerCount('mcp:approval:respond')).toBe(0);
  });
  it('requires the exact typed collection name for a whole-collection proposal, not just a click', async () => {
    const { sender, window } = gui();
    const events = ipcMain as unknown as EventEmitter;
    const prompt = createGuiApproval(() => window);
    events.emit('mcp:approval:ready', { sender });
    const typedProposal = { ...proposal, command: 'deleteMany', typeToConfirm: 'notes' };
    for (const typedName of [undefined, 'Notes', 'notes ', 'other']) {
      const decision = prompt.request(typedProposal, new AbortController().signal);
      const request = sender.send.mock.calls.at(-1)?.[1];
      expect(request.typeToConfirm).toBe('notes');
      events.emit('mcp:approval:respond', { sender }, request.id, true, typedName);
      expect(await decision).toBe(false);
    }
    const decision = prompt.request(typedProposal, new AbortController().signal);
    const request = sender.send.mock.calls.at(-1)?.[1];
    events.emit('mcp:approval:respond', { sender }, request.id, true, 'notes');
    expect(await decision).toBe(true);
  });

  it.each([
    ['dropCollection', 'notes', 'Notes'],
    ['emptyCollection', 'notes', 'notes '],
    ['dropCollections', 'sandbox', 'notes'],
  ])('rejects wrong typed name for %s in the main-process gate', async (command, expected, wrong) => {
    const { sender, window } = gui();
    const events = ipcMain as unknown as EventEmitter;
    const prompt = createGuiApproval(() => window);
    events.emit('mcp:approval:ready', { sender });
    const typedProposal = { ...proposal, command, typeToConfirm: expected };
    const rejected = prompt.request(typedProposal, new AbortController().signal);
    const request = sender.send.mock.calls.at(-1)?.[1];
    events.emit('mcp:approval:respond', { sender }, request.id, true, wrong);
    expect(await rejected).toBe(false);
    const accepted = prompt.request(typedProposal, new AbortController().signal);
    const second = sender.send.mock.calls.at(-1)?.[1];
    events.emit('mcp:approval:respond', { sender }, second.id, true, expected);
    expect(await accepted).toBe(true);
  });
  it('fails closed on window navigation, cancelling any late approval', async () => {
    const { sender, window } = gui();
    const events = ipcMain as unknown as EventEmitter;
    const prompt = createGuiApproval(() => window);
    events.emit('mcp:approval:ready', { sender });
    const decision = prompt.request(proposal, new AbortController().signal);
    const request = sender.send.mock.calls[0][1];
    sender.emit('did-start-navigation');
    await expect(decision).rejects.toThrow('GUI closed during approval');
    events.emit('mcp:approval:respond', { sender }, request.id, true);
    await expect(prompt.request(proposal, new AbortController().signal)).rejects.toThrow('GUI is unavailable');
  });
});
