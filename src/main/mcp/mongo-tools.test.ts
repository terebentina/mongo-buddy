import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMongoMcpTools, type McpToolEntry } from './mongo-tools';
import type { Dispatch, MongoCommand } from '../commands/dispatch';

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
    ipcChannel: 'mongo:count',
    mcpToolName: 'count',
    input: z.object({ db: z.string() }),
    run: vi.fn().mockResolvedValue(0),
  };
}

describe('registerMongoMcpTools', () => {
  let server: McpServer;
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    server = createServer();
    dispatch = vi.fn();
  });

  it('registers each tool by mcpToolName with the supplied description', () => {
    const cmd = makeCommand();
    const entry: McpToolEntry<typeof cmd.input, number> = {
      command: cmd,
      description: 'Count docs',
    };
    registerMongoMcpTools({ server, dispatch: dispatch as unknown as Dispatch, tools: [entry] });
    const tool = registered(server)['count'];
    expect(tool).toBeDefined();
    expect(tool.description).toBe('Count docs');
  });

  it('handler dispatches to the command and returns success as a text CallToolResult', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: true, data: 42 });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [{ command: cmd, description: 'Count docs' }],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(dispatch).toHaveBeenCalledWith(cmd, { db: 'test' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('42');
  });

  it('handler returns isError CallToolResult on dispatch failure', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: false, error: 'boom' });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [{ command: cmd, description: 'Count docs' }],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('boom');
  });

  it('replaces "Not connected" error text with custom notConnectedMessage when provided', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: false, error: 'Not connected' });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [
        {
          command: cmd,
          description: 'd',
          notConnectedMessage: 'Connect via the GUI first.',
        },
      ],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Connect via the GUI first.');
  });

  it('does not replace non-Not-connected errors with notConnectedMessage', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: false, error: 'something else' });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [{ command: cmd, description: 'd', notConnectedMessage: 'GUI' }],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(result.content[0].text).toBe('something else');
  });

  it('applies transformInput before dispatching', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: true, data: 0 });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [
        {
          command: cmd,
          description: 'd',
          transformInput: (i) => ({ ...i, db: (i.db as string).toUpperCase() }),
        },
      ],
    });
    const handler = registered(server)['count'].handler;
    await handler({ db: 'test' });
    expect(dispatch).toHaveBeenCalledWith(cmd, { db: 'TEST' });
  });

  it('serializes object results as JSON', async () => {
    const cmd = makeCommand();
    dispatch.mockResolvedValue({ ok: true, data: { docs: [{ a: 1 }], totalCount: 1 } });
    registerMongoMcpTools({
      server,
      dispatch: dispatch as unknown as Dispatch,
      tools: [{ command: cmd, description: 'd' }],
    });
    const handler = registered(server)['count'].handler;
    const result = await handler({ db: 'test' });
    expect(result.content[0].text).toBe('{"docs":[{"a":1}],"totalCount":1}');
  });
});
