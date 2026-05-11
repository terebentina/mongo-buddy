import { EJSON } from 'bson';
import { z } from 'zod';
import type { Result } from '../../shared/types';
import type { ActiveConnection, ConnectionManager } from '../connection-manager';

export type MongoCommand<S extends z.ZodType, O> = {
  name: string;
  input: S;
  run(active: ActiveConnection, input: z.infer<S>): Promise<O>;
};

export type Dispatch = <S extends z.ZodType, O>(command: MongoCommand<S, O>, rawInput: unknown) => Promise<Result<O>>;

export function createDispatcher(manager: ConnectionManager): Dispatch {
  return async <S extends z.ZodType, O>(command: MongoCommand<S, O>, rawInput: unknown): Promise<Result<O>> => {
    const active = manager.getActive();
    if (!active) return { ok: false, error: 'Not connected' };

    const parsed = command.input.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: formatZodError(parsed.error) };
    }

    try {
      const input = EJSON.deserialize(parsed.data as Record<string, unknown>) as z.infer<S>;
      const out = await command.run(active, input);
      return { ok: true, data: serializeOutput(out) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
}

function serializeOutput<O>(out: O): O {
  if (out === undefined || out === null) return out;
  if (typeof out !== 'object') return out;
  return EJSON.serialize(out as object) as O;
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
