import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpTools } from './tools';
import type { MongoService } from '../mongo-service';

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
    listDatabases: ReturnType<typeof vi.fn>;
    listCollections: ReturnType<typeof vi.fn>;
    sampleFields: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    distinct: ReturnType<typeof vi.fn>;
    listIndexes: ReturnType<typeof vi.fn>;
    explain: ReturnType<typeof vi.fn>;
  };
} {
  const mocks = {
    listDatabases: vi.fn(),
    listCollections: vi.fn(),
    sampleFields: vi.fn(),
    find: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    distinct: vi.fn(),
    listIndexes: vi.fn(),
    explain: vi.fn(),
  };
  return { service: mocks as unknown as MongoService, mocks };
}

describe('registerMcpTools', () => {
  let server: McpServer;
  let service: MongoService;
  let mocks: ReturnType<typeof createServiceMock>['mocks'];

  beforeEach(() => {
    server = createServer();
    const built = createServiceMock();
    service = built.service;
    mocks = built.mocks;
    registerMcpTools(server, service);
  });

  it('registers exactly 9 tools', () => {
    const names = Object.keys(registered(server)).sort();
    expect(names).toEqual(
      [
        'aggregate',
        'count',
        'distinct',
        'explain',
        'find',
        'list_collections',
        'list_databases',
        'list_indexes',
        'sample_fields',
      ].sort()
    );
  });

  describe('list_databases', () => {
    it('returns serialized data on success', async () => {
      const data = [{ name: 'db1', sizeOnDisk: 10, empty: false }];
      mocks.listDatabases.mockResolvedValue({ ok: true, data });
      const result = await getHandler(server, 'list_databases')({});
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(data);
    });

    it('returns isError on failure', async () => {
      mocks.listDatabases.mockResolvedValue({ ok: false, error: 'boom' });
      const result = await getHandler(server, 'list_databases')({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('boom');
    });

    it('rewrites "Not connected" error', async () => {
      mocks.listDatabases.mockResolvedValue({ ok: false, error: 'Not connected' });
      const result = await getHandler(server, 'list_databases')({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
    });
  });

  describe('list_collections', () => {
    it('calls service with db arg and returns data', async () => {
      const data = [{ name: 'c1', type: 'collection' }];
      mocks.listCollections.mockResolvedValue({ ok: true, data });
      const result = await getHandler(server, 'list_collections')({ db: 'mydb' });
      expect(mocks.listCollections).toHaveBeenCalledWith('mydb');
      expect(JSON.parse(result.content[0].text)).toEqual(data);
    });

    it('rewrites disconnect error', async () => {
      mocks.listCollections.mockResolvedValue({ ok: false, error: 'Not connected' });
      const result = await getHandler(server, 'list_collections')({ db: 'mydb' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
    });
  });

  describe('sample_fields', () => {
    it('calls service with db and collection', async () => {
      mocks.sampleFields.mockResolvedValue({ ok: true, data: ['_id', 'name'] });
      const result = await getHandler(server, 'sample_fields')({ db: 'd', collection: 'c' });
      expect(mocks.sampleFields).toHaveBeenCalledWith('d', 'c');
      expect(JSON.parse(result.content[0].text)).toEqual(['_id', 'name']);
    });
  });

  describe('find', () => {
    it('uses default limit of 50 when not provided', async () => {
      mocks.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
      await getHandler(server, 'find')({ db: 'd', collection: 'c' });
      const call = mocks.find.mock.calls[0];
      expect(call[2].limit).toBe(50);
    });

    it('clamps limit above 200 to 200', async () => {
      mocks.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
      await getHandler(server, 'find')({ db: 'd', collection: 'c', limit: 999 });
      expect(mocks.find.mock.calls[0][2].limit).toBe(200);
    });

    it('respects a limit within range', async () => {
      mocks.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
      await getHandler(server, 'find')({ db: 'd', collection: 'c', limit: 10 });
      expect(mocks.find.mock.calls[0][2].limit).toBe(10);
    });

    it('passes filter, sort, skip through', async () => {
      mocks.find.mockResolvedValue({ ok: true, data: { docs: [], totalCount: 0 } });
      const filter = { _id: { $oid: '507f1f77bcf86cd799439011' } };
      const sort = { name: 1 as const };
      await getHandler(server, 'find')({ db: 'd', collection: 'c', filter, sort, skip: 5 });
      const opts = mocks.find.mock.calls[0][2];
      expect(opts.filter).toEqual(filter);
      expect(opts.sort).toEqual(sort);
      expect(opts.skip).toBe(5);
    });

    it('response includes totalCount so LLM can paginate', async () => {
      mocks.find.mockResolvedValue({ ok: true, data: { docs: [{ a: 1 }], totalCount: 42 } });
      const result = await getHandler(server, 'find')({ db: 'd', collection: 'c' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalCount).toBe(42);
      expect(parsed.docs).toEqual([{ a: 1 }]);
    });

    it('rewrites disconnect error', async () => {
      mocks.find.mockResolvedValue({ ok: false, error: 'Not connected' });
      const result = await getHandler(server, 'find')({ db: 'd', collection: 'c' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
    });
  });

  describe('count', () => {
    it('passes filter through and returns count', async () => {
      mocks.count.mockResolvedValue({ ok: true, data: 12 });
      const filter = { active: true };
      const result = await getHandler(server, 'count')({ db: 'd', collection: 'c', filter });
      expect(mocks.count).toHaveBeenCalledWith('d', 'c', filter);
      expect(JSON.parse(result.content[0].text)).toBe(12);
    });

    it('defaults filter to {} when omitted', async () => {
      mocks.count.mockResolvedValue({ ok: true, data: 0 });
      await getHandler(server, 'count')({ db: 'd', collection: 'c' });
      expect(mocks.count).toHaveBeenCalledWith('d', 'c', {});
    });
  });

  describe('aggregate', () => {
    it('passes pipeline through', async () => {
      mocks.aggregate.mockResolvedValue({ ok: true, data: [{ _id: 'x', count: 2 }] });
      const pipeline = [{ $match: { x: 1 } }, { $group: { _id: '$x', count: { $sum: 1 } } }];
      const result = await getHandler(server, 'aggregate')({ db: 'd', collection: 'c', pipeline });
      expect(mocks.aggregate).toHaveBeenCalledWith('d', 'c', pipeline);
      expect(JSON.parse(result.content[0].text)).toEqual([{ _id: 'x', count: 2 }]);
    });
  });

  describe('list_indexes', () => {
    it('calls service with db and collection and returns serialized data', async () => {
      const data = [
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
      ];
      mocks.listIndexes.mockResolvedValue({ ok: true, data });
      const result = await getHandler(server, 'list_indexes')({ db: 'd', collection: 'c' });
      expect(mocks.listIndexes).toHaveBeenCalledWith('d', 'c');
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual(data);
    });

    it('returns isError on failure', async () => {
      mocks.listIndexes.mockResolvedValue({ ok: false, error: 'ns not found' });
      const result = await getHandler(server, 'list_indexes')({ db: 'd', collection: 'c' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('ns not found');
    });

    it('rewrites "Not connected" error', async () => {
      mocks.listIndexes.mockResolvedValue({ ok: false, error: 'Not connected' });
      const result = await getHandler(server, 'list_indexes')({ db: 'd', collection: 'c' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
    });
  });

  describe('explain', () => {
    it('filter mode passes args through and returns plan', async () => {
      const plan = { queryPlanner: { winningPlan: { stage: 'IXSCAN' } } };
      mocks.explain.mockResolvedValue({ ok: true, data: plan });
      const result = await getHandler(
        server,
        'explain'
      )({ db: 'd', collection: 'c', queryMode: 'filter', query: { name: 'Alice' } });
      expect(mocks.explain).toHaveBeenCalledWith('d', 'c', 'filter', { name: 'Alice' });
      expect(JSON.parse(result.content[0].text)).toEqual(plan);
    });

    it('aggregate mode passes pipeline through', async () => {
      mocks.explain.mockResolvedValue({ ok: true, data: { stages: [] } });
      const pipeline = [{ $match: { x: 1 } }];
      await getHandler(server, 'explain')({ db: 'd', collection: 'c', queryMode: 'aggregate', query: pipeline });
      expect(mocks.explain).toHaveBeenCalledWith('d', 'c', 'aggregate', pipeline);
    });

    it('rewrites disconnect error', async () => {
      mocks.explain.mockResolvedValue({ ok: false, error: 'Not connected' });
      const result = await getHandler(server, 'explain')({ db: 'd', collection: 'c', queryMode: 'filter', query: {} });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Not connected. Connect via the mongo-buddy GUI first.');
    });
  });

  describe('distinct', () => {
    it('passes field and filter through', async () => {
      mocks.distinct.mockResolvedValue({ ok: true, data: { values: ['a', 'b'], truncated: false } });
      const result = await getHandler(
        server,
        'distinct'
      )({
        db: 'd',
        collection: 'c',
        field: 'status',
        filter: { active: true },
      });
      expect(mocks.distinct).toHaveBeenCalledWith('d', 'c', 'status', { active: true });
      expect(JSON.parse(result.content[0].text)).toEqual({ values: ['a', 'b'], truncated: false });
    });

    it('defaults filter to {}', async () => {
      mocks.distinct.mockResolvedValue({ ok: true, data: { values: [], truncated: false } });
      await getHandler(server, 'distinct')({ db: 'd', collection: 'c', field: 'status' });
      expect(mocks.distinct).toHaveBeenCalledWith('d', 'c', 'status', {});
    });
  });
});
