import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { Dispatch, MongoCommand } from '../commands/dispatch';
import type { WriteApproval } from './write-approval';

const NOT_CONNECTED_MESSAGE = 'Not connected. Connect via the mongo-buddy GUI first.';

export interface McpToolEntry<S extends z.ZodType, O> {
  command: MongoCommand<S, O>;
  title?: string;
  requiresApproval?: boolean;
  typeToConfirm?: (input: Record<string, unknown>) => string | undefined;
  description: string;
  annotations?: ToolAnnotations;
  transformInput?: (input: z.infer<S>) => z.infer<S>;
}

export interface RegisterMongoMcpToolsDeps {
  server: McpServer;
  dispatch: Dispatch;
  tools: McpToolEntry<z.ZodType, unknown>[];
  approval: WriteApproval;
  signal: AbortSignal;
}

export function registerMongoMcpTools(deps: RegisterMongoMcpToolsDeps): void {
  for (const entry of deps.tools) {
    const { command, description, annotations, transformInput, title, requiresApproval, typeToConfirm } = entry;
    const inputSchema = command.input instanceof z.ZodObject ? command.input.shape : command.input;
    deps.server.registerTool(
      command.name,
      { title, description, annotations, inputSchema },
      async (rawInput: z.infer<typeof command.input>, extra): Promise<CallToolResult> => {
        const input = transformInput ? transformInput(rawInput) : rawInput;
        const result = requiresApproval
          ? await deps.approval.execute(command, input, AbortSignal.any([extra.signal, deps.signal]), typeToConfirm)
          : await deps.dispatch(command, input);
        if (result.ok) {
          return { content: [{ type: 'text', text: JSON.stringify(result.data ?? null) }] };
        }
        const text = result.error === 'Not connected' ? NOT_CONNECTED_MESSAGE : result.error;
        return { isError: true, content: [{ type: 'text', text }] };
      }
    );
  }
}
