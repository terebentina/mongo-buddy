import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Dispatch, MongoCommand } from '../commands/dispatch';

export interface McpToolEntry<S extends z.ZodObject<z.ZodRawShape>, O> {
  command: MongoCommand<S, O>;
  description: string;
  transformInput?: (input: z.infer<S>) => z.infer<S>;
  notConnectedMessage?: string;
}

export interface RegisterMongoMcpToolsDeps {
  server: McpServer;
  dispatch: Dispatch;
  tools: McpToolEntry<z.ZodObject<z.ZodRawShape>, unknown>[];
}

export function registerMongoMcpTools(deps: RegisterMongoMcpToolsDeps): void {
  for (const entry of deps.tools) {
    const { command, description, transformInput, notConnectedMessage } = entry;
    deps.server.registerTool(
      command.name,
      { description, inputSchema: command.input.shape },
      async (rawInput: z.infer<typeof command.input>): Promise<CallToolResult> => {
        const input = transformInput ? transformInput(rawInput) : rawInput;
        const result = await deps.dispatch(command, input);
        if (result.ok) {
          return { content: [{ type: 'text', text: JSON.stringify(result.data) }] };
        }
        const text = result.error === 'Not connected' && notConnectedMessage ? notConnectedMessage : result.error;
        return { isError: true, content: [{ type: 'text', text }] };
      }
    );
  }
}
