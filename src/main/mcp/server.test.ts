import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer as createHttpServer, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpServer } from './server';
import { createDispatcher } from '../commands/dispatch';
import { MCP_TOOLS } from './mongo-tool-entries';
import type { ConnectionManager } from '../connection-manager';
import type { MongoClient } from 'mongodb';

const EXPECTED_TOOL_NAMES = [
  'aggregate',
  'count',
  'createCollection',
  'deleteOne',
  'deleteMany',
  'distinct',
  'dropCollection',
  'dropCollections',
  'emptyCollection',
  'explain',
  'find',
  'insertOne',
  'listCollections',
  'listDatabases',
  'listIndexes',
  'renameCollection',
  'sampleFields',
  'updateMany',
  'updateOne',
].sort();

function mockManager(): ConnectionManager {
  return { getActive: () => null } as unknown as ConnectionManager;
}

async function listenBlocker(): Promise<{ server: Server; port: number }> {
  const server = createHttpServer();
  await new Promise<void>((res) => server.listen(0, '0.0.0.0', () => res()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('blocker: unexpected address()');
  }
  return { server, port: addr.port };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((res) => server.close(() => res()));
}

describe('startMcpServer', () => {
  const restore: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (restore.length > 0) {
      const fn = restore.pop();
      if (fn) await fn();
    }
  });

  it('round-trips initialize + tools/list and returns all expected tool names', async () => {
    const manager = mockManager();
    const handle = await startMcpServer({
      dispatch: createDispatcher(manager),
      mongoTools: MCP_TOOLS,
      port: 0,
    });
    expect(handle).not.toBeNull();
    if (!handle) return;
    restore.push(() => handle.close());

    expect(handle.actualPort).toBeGreaterThan(0);
    expect(handle.address).toBe('0.0.0.0');

    const url = new URL(`http://127.0.0.1:${handle.actualPort}/mcp`);
    const client = new Client({ name: 'mongo-buddy-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    restore.push(() => client.close());

    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
    const aggregate = listed.tools.find((tool) => tool.name === 'aggregate');
    expect(aggregate?.description).toContain('$out');
    expect(aggregate?.description).toContain('$merge');
    expect(aggregate?.description).toContain('without MongoBuddy GUI approval');
    expect(aggregate?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    const insert = listed.tools.find((tool) => tool.name === 'insertOne');
    expect(insert?.title).toContain('WRITE');
    expect(insert?.description).toContain('confirmation required');
    expect(insert?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    for (const name of ['updateOne', 'deleteOne']) {
      const tool = listed.tools.find((item) => item.name === name);
      expect(tool?.title).toContain('WRITE');
      expect(tool?.description).toContain('GUI approval');
      expect(tool?.description).toContain('identifier');
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: name === 'deleteOne',
        idempotentHint: true,
      });
    }
    const update = listed.tools.find((tool) => tool.name === 'updateMany');
    expect(update?.title).toContain('WRITE');
    expect(update?.description).toContain('arrayFilters');
    expect(update?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const deleteTool = listed.tools.find((tool) => tool.name === 'deleteMany');
    expect(deleteTool?.title).toContain('WRITE');
    expect(deleteTool?.description).toContain('exact collection name');
    expect(deleteTool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    for (const name of [
      'createCollection',
      'renameCollection',
      'emptyCollection',
      'dropCollection',
      'dropCollections',
    ]) {
      const tool = listed.tools.find((item) => item.name === name);
      expect(tool?.title).toContain('WRITE');
      expect(tool?.description).toContain('MongoBuddy GUI approval');
      expect(tool?.annotations?.readOnlyHint).toBe(false);
    }
    expect(names).not.toContain('aggregateWrite');
  });

  it('runs output-stage aggregations directly over HTTP without an approval gate', async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const aggregate = vi.fn().mockReturnValue({ toArray });
    const countDocuments = vi.fn().mockResolvedValue(3);
    const collection = vi.fn().mockReturnValue({ aggregate, countDocuments });
    const db = vi.fn().mockReturnValue({ collection });
    const manager = {
      getActive: () => ({ client: { db } as unknown as MongoClient, key: 'test-connection' }),
    } as unknown as ConnectionManager;
    const handle = await startMcpServer({
      dispatch: createDispatcher(manager),
      mongoTools: MCP_TOOLS,
      port: 0,
    });
    if (!handle) throw new Error('expected handle');
    restore.push(() => handle.close());

    const client = new Client({ name: 'mongo-buddy-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${handle.actualPort}/mcp`)));
    restore.push(() => client.close());

    for (const pipeline of [[{ $out: 'archive' }], [{ $merge: 'archive' }]]) {
      const result = await client.callTool({
        name: 'aggregate',
        arguments: { db: 'test', collection: 'orders', pipeline },
      });
      expect(result).toMatchObject({ content: [{ type: 'text', text: '[]' }] });
      expect(result.isError).not.toBe(true);
      expect(aggregate).toHaveBeenLastCalledWith(pipeline);
    }
    expect(toArray).toHaveBeenCalledTimes(2);
    expect(db).toHaveBeenCalledWith('test');
    expect(collection).toHaveBeenCalledWith('orders');

    const count = await client.callTool({
      name: 'count',
      arguments: { db: 'test', collection: 'orders', filter: {} },
    });
    expect(count).toMatchObject({ content: [{ type: 'text', text: '3' }] });
    expect(countDocuments).toHaveBeenCalledWith({});
  });

  it('returns null when the port is already in use (does not throw)', async () => {
    const blocker = await listenBlocker();
    restore.push(() => closeServer(blocker.server));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    restore.push(() => errSpy.mockRestore());

    const manager = mockManager();
    const handle = await startMcpServer({
      dispatch: createDispatcher(manager),
      mongoTools: MCP_TOOLS,
      port: blocker.port,
    });
    expect(handle).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('close() stops accepting connections', async () => {
    const manager = mockManager();
    const handle = await startMcpServer({
      dispatch: createDispatcher(manager),
      mongoTools: MCP_TOOLS,
      port: 0,
    });
    if (!handle) throw new Error('expected handle');
    const port = handle.actualPort;
    await handle.close();

    // Fetching the closed port should fail with a connection error.
    await expect(fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).rejects.toThrow();
  });
});
