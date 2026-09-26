import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMongoMcpTools, type McpToolEntry } from './mongo-tools';
import { createWriteApproval, type WriteApproval } from './write-approval';
import { createDispatcher, type Dispatch, type MongoCommand } from '../commands/dispatch';
import type { ConnectionManager } from '../connection-manager';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

interface ServerInternals {
  _registeredTools: Record<string, { handler: ToolHandler; description?: string }>;
}

function createServer(): McpServer {
  return new McpServer({ name: 'mongo-buddy', version: 'test' }, { capabilities: { tools: {} } });
}

function registered(server: McpServer): Record<string, { handler: ToolHandler; description?: string }> {
  return (server as unknown as ServerInternals)._registeredTools;
}

function makeCommand(): MongoCommand<z.ZodObject<{ db: z.ZodString }>, number> {
  return {
    name: 'count',
    input: z.object({ db: z.string() }),
    run: vi.fn().mockResolvedValue(0),
  };
}

describe('registerMongoMcpTools', () => {
  let server: McpServer;
  let dispatch: ReturnType<typeof vi.fn>;
  let approval: WriteApproval;
  const signal = new AbortController().signal;

  beforeEach(() => {
    server = createServer();
    dispatch = vi.fn();
    const manager = { getActive: () => null } as unknown as ConnectionManager;
    approval = createWriteApproval(manager, createDispatcher(manager), {
      request: () => Promise.reject(new Error('Unexpected GUI approval request')),
    });
  });

  it('handler returns isError CallToolResult on dispatch failure', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: false, error: 'boom' });
    registerMongoMcpTools({
      server,
      approval,
      signal,
      dispatch: dispatch as unknown as Dispatch,
      tools: [{ command: cmd, description: 'Count docs' }],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('boom');
  });

  it('applies transformInput before dispatching', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: true, data: 0 });
    const entry: McpToolEntry<typeof cmd.input, number> = {
      command: cmd,
      description: 'd',
      transformInput: (i) => ({ ...i, db: i.db.toUpperCase() }),
    };
    registerMongoMcpTools({ server, dispatch: dispatch as unknown as Dispatch, approval, tools: [entry], signal });
    const handler = registered(server)['count'].handler;
    await handler({ db: 'test' });
    expect(dispatch).toHaveBeenCalledWith(cmd, { db: 'TEST' });
  });
});
