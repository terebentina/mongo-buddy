import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer as createHttpServer, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpServer } from './server';
import type { MongoService } from '../mongo-service';

const EXPECTED_TOOL_NAMES = [
  'aggregate',
  'count',
  'distinct',
  'find',
  'list_collections',
  'list_databases',
  'sample_fields',
].sort();

function mockService(): MongoService {
  return {} as MongoService;
}

async function listenBlocker(): Promise<{ server: Server; port: number }> {
  const server = createHttpServer();
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
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

  it('round-trips initialize + tools/list and returns all 7 tool names', async () => {
    const handle = await startMcpServer({ service: mockService(), port: 0 });
    expect(handle).not.toBeNull();
    if (!handle) return;
    restore.push(() => handle.close());

    expect(handle.actualPort).toBeGreaterThan(0);
    expect(handle.address).toBe('127.0.0.1');

    const url = new URL(`http://127.0.0.1:${handle.actualPort}/mcp`);
    const client = new Client({ name: 'mongo-buddy-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    restore.push(() => client.close());

    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('returns null when the port is already in use (does not throw)', async () => {
    const blocker = await listenBlocker();
    restore.push(() => closeServer(blocker.server));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    restore.push(() => errSpy.mockRestore());

    const handle = await startMcpServer({ service: mockService(), port: blocker.port });
    expect(handle).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('close() stops accepting connections', async () => {
    const handle = await startMcpServer({ service: mockService(), port: 0 });
    if (!handle) throw new Error('expected handle');
    const port = handle.actualPort;
    await handle.close();

    // Fetching the closed port should fail with a connection error.
    await expect(fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' })).rejects.toThrow();
  });
});
