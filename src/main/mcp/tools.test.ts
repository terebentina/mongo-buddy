import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MongoClient } from 'mongodb';
import { registerMcpTools } from './tools';
import type { MongoService } from '../mongo-service';
import type { ActiveConnection, ConnectionManager } from '../connection-manager';

const TEST_ACTIVE: ActiveConnection = {
  client: {} as unknown as MongoClient,
  key: 'localhost:27017',
};

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

interface ServerInternals {
  _registeredTools: Record<string, { handler: ToolHandler }>;
}

function createServer(): McpServer {
  return new McpServer({ name: 'mongo-buddy', version: 'test' }, { capabilities: { tools: {} } });
}

function registered(server: McpServer): Record<string, { handler: ToolHandler }> {
  return (server as unknown as ServerInternals)._registeredTools;
}

function getHandler(server: McpServer, name: string): ToolHandler {
  const tools = registered(server);
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.handler;
}

function createServiceMock(): {
  service: MongoService;
  mocks: {
    explain: ReturnType<typeof vi.fn>;
  };
} {
  const mocks = {
    explain: vi.fn(),
  };
  return { service: mocks as unknown as MongoService, mocks };
}

describe('registerMcpTools', () => {
  let server: McpServer;
  let service: MongoService;
  let mocks: ReturnType<typeof createServiceMock>['mocks'];
  let manager: { getActive: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    server = createServer();
    const built = createServiceMock();
    service = built.service;
    mocks = built.mocks;
    manager = { getActive: vi.fn().mockReturnValue(TEST_ACTIVE) };
    registerMcpTools(server, service, manager as unknown as ConnectionManager);
  });

  it('registers exactly 1 tool', () => {
    const names = Object.keys(registered(server)).sort();
    expect(names).toEqual(['explain']);
  });

  describe('explain', () => {
    it('filter mode passes args through and returns plan', async () => {
      const plan = { queryPlanner: { winningPlan: { stage: 'IXSCAN' } } };
      mocks.explain.mockResolvedValue({ ok: true, data: plan });
      const result = await getHandler(
        server,
        'explain'
      )({ db: 'd', collection: 'c', queryMode: 'filter', query: { name: 'Alice' } });
      expect(mocks.explain).toHaveBeenCalledWith(TEST_ACTIVE, 'd', 'c', 'filter', { name: 'Alice' });
      expect(JSON.parse(result.content[0].text)).toEqual(plan);
    });

    it('aggregate mode passes pipeline through', async () => {
      mocks.explain.mockResolvedValue({ ok: true, data: { stages: [] } });
      const pipeline = [{ $match: { x: 1 } }];
      await getHandler(server, 'explain')({ db: 'd', collection: 'c', queryMode: 'aggregate', query: pipeline });
      expect(mocks.explain).toHaveBeenCalledWith(TEST_ACTIVE, 'd', 'c', 'aggregate', pipeline);
    });

    it('returns disconnect message when not connected', async () => {
      manager.getActive.mockReturnValue(null);
      const result = await getHandler(server, 'explain')({ db: 'd', collection: 'c', queryMode: 'filter', query: {} });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
      expect(mocks.explain).not.toHaveBeenCalled();
    });
  });
});
