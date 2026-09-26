import { EJSON } from 'bson';
import type { z } from 'zod';
import type { Result } from '../../shared/types';
import type { ActiveConnection, ConnectionManager } from '../connection-manager';
import type { Dispatch, MongoCommand } from '../commands/dispatch';

export interface WriteProposal {
  command: string;
  connectionKey: string;
  db: string;
  collection: string;
  input: string;
  typeToConfirm?: string;
}

export interface ApprovalPrompt {
  request(proposal: WriteProposal, signal: AbortSignal): Promise<boolean>;
}

export interface WriteApproval {
  execute<S extends z.ZodType, O>(
    command: MongoCommand<S, O>,
    rawInput: unknown,
    signal: AbortSignal,
    typeToConfirm?: (input: Record<string, unknown>) => string | undefined
  ): Promise<Result<O>>;
  cancel(): void;
}

const TIMEOUT_MS = 60_000;

export function createWriteApproval(
  manager: ConnectionManager,
  dispatch: Dispatch,
  prompt: ApprovalPrompt
): WriteApproval {
  let pending: ((reason: string) => void) | null = null;
  let stopped = false;

  return {
    async execute<S extends z.ZodType, O>(
      command: MongoCommand<S, O>,
      rawInput: unknown,
      signal: AbortSignal,
      typeToConfirm?: (input: Record<string, unknown>) => string | undefined
    ): Promise<Result<O>> {
      if (stopped) return { ok: false, error: 'MCP server is shutting down' };
      if (pending) return { ok: false, error: 'Another MCP write approval is pending' };
      if (signal.aborted) return { ok: false, error: 'MCP write request cancelled' };
      const active = manager.getActive();
      if (!active) return { ok: false, error: 'Not connected' };

      const parsed = command.input.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
      }
      let input: z.infer<S>;
      try {
        // The same immutable JSON snapshot is displayed and later dispatched; never trust mutable caller input after awaiting.
        input = JSON.parse(JSON.stringify(parsed.data)) as z.infer<S>;
        EJSON.deserialize(input as Record<string, unknown>);
      } catch (err) {
        return { ok: false, error: `Invalid EJSON input: ${(err as Error).message}` };
      }
      const fields = input as { db?: string; collection?: string; from?: string; to?: string; names?: string[] };
      const controller = new AbortController();
      let failure = 'MCP write request cancelled';
      const abort = (reason: string): void => {
        if (controller.signal.aborted) return;
        failure = reason;
        controller.abort();
      };
      pending = abort;
      const onRequestAbort = (): void => abort('MCP write request cancelled');
      const onConnectionChange = (): void => abort('Active MongoDB connection changed during approval');
      signal.addEventListener('abort', onRequestAbort, { once: true });
      const unsubscribe = manager.onStateChange(onConnectionChange);
      const timer = setTimeout(() => abort('MCP write approval timed out'), TIMEOUT_MS);
      if (signal.aborted) abort('MCP write request cancelled');
      const interrupted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(failure)), { once: true });
        if (controller.signal.aborted) reject(new Error(failure));
      });
      try {
        const confirmation = typeToConfirm?.(input as Record<string, unknown>);
        const proposal: WriteProposal = {
          command: command.name,
          connectionKey: active.key,
          db: fields.db ?? '',
          collection:
            fields.collection ??
            (fields.from !== undefined && fields.to !== undefined
              ? `${JSON.stringify(fields.from)} → ${JSON.stringify(fields.to)}`
              : JSON.stringify(fields.names ?? [])),
          input: JSON.stringify(input, null, 2),
          ...(confirmation !== undefined ? { typeToConfirm: confirmation } : {}),
        };
        const approved = await Promise.race([prompt.request(proposal, controller.signal), interrupted]);
        if (controller.signal.aborted) return { ok: false, error: failure };
        if (!approved) return { ok: false, error: 'MCP write denied in MongoBuddy' };
        const current = manager.getActive();
        if (!sameConnection(current, active))
          return { ok: false, error: 'Active MongoDB connection changed during approval' };
        // Dispatch remains the sole validation/EJSON/driver/result boundary. The connection check and its getActive
        // happen synchronously before any await, so a different client cannot be substituted after approval.
        return await dispatch(command, input);
      } catch (err) {
        return {
          ok: false,
          error: controller.signal.aborted ? failure : `MCP write approval unavailable: ${(err as Error).message}`,
        };
      } finally {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener('abort', onRequestAbort);
        pending = null;
      }
    },
    cancel() {
      stopped = true;
      pending?.('MCP server is shutting down');
    },
  };
}

function sameConnection(current: ActiveConnection | null, original: ActiveConnection): boolean {
  return current?.client === original.client && current.key === original.key;
}
