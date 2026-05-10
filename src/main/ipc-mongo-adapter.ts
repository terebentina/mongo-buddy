import type { z } from 'zod';
import type { Dispatch, MongoCommand } from './commands/dispatch';

type IpcHandleFn = (event: unknown, ...args: unknown[]) => unknown;

export interface IpcRegistrar {
  handle(channel: string, listener: IpcHandleFn): void;
}

export interface RegisterMongoIpcCommandsDeps {
  ipcMain: IpcRegistrar;
  dispatch: Dispatch;
  commands: MongoCommand<z.ZodTypeAny, unknown>[];
}

export function registerMongoIpcCommands(deps: RegisterMongoIpcCommandsDeps): void {
  for (const command of deps.commands) {
    deps.ipcMain.handle(command.ipcChannel, async (_event, input) => deps.dispatch(command, input));
  }
}
