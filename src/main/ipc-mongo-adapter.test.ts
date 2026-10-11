import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { registerMongoIpcCommands } from './ipc-mongo-adapter';
import type { MongoCommand } from './commands/dispatch';

function makeCommand(
  overrides: Partial<MongoCommand<z.ZodTypeAny, unknown>> = {}
): MongoCommand<z.ZodTypeAny, unknown> {
  return {
    name: 'noop',
    input: z.object({}),
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('registerMongoIpcCommands', () => {
  it('registers ipcMain.handle for each command using mongo:<name>', () => {
    const handle = vi.fn();
    const dispatch = vi.fn();
    const a = makeCommand({ name: 'a' });
    const b = makeCommand({ name: 'b' });

    registerMongoIpcCommands({ ipcMain: { handle }, dispatch, commands: [a, b] });

    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle.mock.calls[0][0]).toBe('mongo:a');
    expect(handle.mock.calls[1][0]).toBe('mongo:b');
  });
});
