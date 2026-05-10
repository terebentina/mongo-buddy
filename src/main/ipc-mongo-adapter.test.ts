import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { registerMongoIpcCommands } from './ipc-mongo-adapter';
import type { MongoCommand } from './commands/dispatch';

function makeCommand(
  overrides: Partial<MongoCommand<z.ZodTypeAny, unknown>> = {}
): MongoCommand<z.ZodTypeAny, unknown> {
  return {
    name: 'noop',
    ipcChannel: 'mongo:noop',
    mcpToolName: 'noop',
    input: z.object({}),
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('registerMongoIpcCommands', () => {
  it('registers ipcMain.handle for each command using its ipcChannel', () => {
    const handle = vi.fn();
    const dispatch = vi.fn();
    const a = makeCommand({ ipcChannel: 'mongo:a' });
    const b = makeCommand({ ipcChannel: 'mongo:b' });

    registerMongoIpcCommands({ ipcMain: { handle }, dispatch, commands: [a, b] });

    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle.mock.calls[0][0]).toBe('mongo:a');
    expect(handle.mock.calls[1][0]).toBe('mongo:b');
  });

  it('handler delegates to dispatch with command + raw input', async () => {
    const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();
    const handle = vi.fn((channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    });
    const dispatch = vi.fn().mockResolvedValue({ ok: true, data: 5 });
    const cmd = makeCommand({ ipcChannel: 'mongo:count' });

    registerMongoIpcCommands({ ipcMain: { handle }, dispatch, commands: [cmd] });

    const handler = handlers.get('mongo:count');
    expect(handler).toBeDefined();
    const result = await handler!({}, { db: 'd', collection: 'c' });

    expect(dispatch).toHaveBeenCalledWith(cmd, { db: 'd', collection: 'c' });
    expect(result).toEqual({ ok: true, data: 5 });
  });
});
