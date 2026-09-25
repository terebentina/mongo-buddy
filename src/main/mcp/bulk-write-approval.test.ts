import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ObjectId } from 'bson';
import type { MongoClient } from 'mongodb';
import type { ConnectionManager, ConnectionState } from '../connection-manager';
import { createDispatcher } from '../commands/dispatch';
import { MCP_TOOLS } from './mongo-tool-entries';
import { startMcpServer } from './server';
import { createWriteApproval, type WriteProposal } from './write-approval';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()?.();
});

async function setup() {
  const updateMany = vi.fn().mockResolvedValue({ matchedCount: 5, modifiedCount: 3 });
  const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 4 });
  const db = vi.fn(() => ({ collection: () => ({ updateMany, deleteMany }) }));
  const client = { db } as unknown as MongoClient;
  let active: { client: MongoClient; key: string } | null = { client, key: 'local' };
  const subscribers = new Set<(state: ConnectionState) => void>();
  const manager = {
    getActive: () => active,
    onStateChange: (cb: (state: ConnectionState) => void) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  } as unknown as ConnectionManager;
  const requests: WriteProposal[] = [];
  const pending: Array<(approved: boolean) => void> = [];
  let nextPrompt = deferred<void>();
  const approval = createWriteApproval(manager, createDispatcher(manager), {
    request: (proposal) => {
      requests.push(proposal);
      nextPrompt.resolve();
      return new Promise<boolean>((resolve) => pending.push(resolve));
    },
  });
  const server = await startMcpServer({
    dispatch: createDispatcher(manager),
    approval,
    mongoTools: MCP_TOOLS,
    port: 0,
  });
  if (!server) throw new Error('MCP server did not start');
  cleanup.push(() => server.close());
  const mcp = new Client({ name: 'bulk-write-test', version: '1' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.actualPort}/mcp`)));
  cleanup.push(() => mcp.close());
  return {
    updateMany,
    deleteMany,
    requests,
    call: (name: string, args: unknown) => mcp.callTool({ name, arguments: args as Record<string, unknown> }),
    async prompted() {
      await nextPrompt.promise;
      nextPrompt = deferred<void>();
      return requests.at(-1)!;
    },
    decide: (approved: boolean) => pending.shift()?.(approved),
    switchClient() {
      active = { client: { db } as unknown as MongoClient, key: 'local' };
      subscribers.forEach((cb) => cb({ status: 'connected', uri: 'mongodb://localhost', connectionKey: 'local' }));
    },
    disconnect() {
      active = null;
      subscribers.forEach((cb) => cb({ status: 'disconnected' }));
    },
  };
}

describe('MCP bulk writes over HTTP', () => {
  it('approves the complete update document/filter/options including EJSON and returns driver counts', async () => {
    const app = await setup();
    const args = {
      db: 'sandbox',
      collection: 'notes',
      filter: { owner: { $oid: '507f1f77bcf86cd799439011' } },
      update: { $set: { checked: { $date: '2024-01-01T00:00:00Z' }, 'items.$[item].done': true } },
      options: { arrayFilters: [{ 'item.date': { $date: '2023-01-01T00:00:00Z' } }], upsert: true },
    };
    const call = app.call('updateMany', args);
    const proposal = await app.prompted();
    expect(proposal).toMatchObject({ command: 'updateMany', connection: 'local', db: 'sandbox', collection: 'notes' });
    expect(JSON.parse(proposal.input)).toEqual(args);
    expect(proposal.typeToConfirm).toBeUndefined();
    expect(app.updateMany).not.toHaveBeenCalled();
    app.decide(true);
    expect(await call).toMatchObject({ content: [{ text: '{"matchedCount":5,"modifiedCount":3}' }] });
    const [filter, update, options] = app.updateMany.mock.calls[0];
    expect(filter.owner).toEqual(new ObjectId('507f1f77bcf86cd799439011'));
    expect(update.$set.checked).toBeInstanceOf(Date);
    expect(options.arrayFilters[0]['item.date']).toBeInstanceOf(Date);
    expect(options.upsert).toBe(true);
    expect(app.requests).toHaveLength(1);
  });

  it('approves an update pipeline unchanged and denies a separate update without mutation', async () => {
    const app = await setup();
    const args = {
      db: 'sandbox',
      collection: 'notes',
      filter: { active: true },
      update: [{ $set: { copy: '$name' } }],
    };
    const pipelineCall = app.call('updateMany', args);
    expect(JSON.parse((await app.prompted()).input)).toEqual(args);
    app.decide(true);
    expect(await pipelineCall).toMatchObject({ content: [{ text: '{"matchedCount":5,"modifiedCount":3}' }] });
    expect(app.updateMany).toHaveBeenCalledWith({ active: true }, args.update);
    const deniedCall = app.call('updateMany', args);
    await app.prompted();
    app.decide(false);
    expect(await deniedCall).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.updateMany).toHaveBeenCalledTimes(1);
  });

  it('deletes matching documents after click; empty filter requests collection-name typing, denial does not delete', async () => {
    const app = await setup();
    const filtered = app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: { expired: true } });
    const first = await app.prompted();
    expect(first.typeToConfirm).toBeUndefined();
    expect(JSON.parse(first.input).filter).toEqual({ expired: true });
    app.decide(true);
    expect(await filtered).toMatchObject({ content: [{ text: '4' }] });
    expect(app.deleteMany).toHaveBeenCalledWith({ expired: true });

    const all = app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: {} });
    const second = await app.prompted();
    expect(second.typeToConfirm).toBe('notes');
    expect(JSON.parse(second.input).filter).toEqual({});
    app.decide(false);
    expect(await all).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.deleteMany).toHaveBeenCalledTimes(1);

    const approvedAll = app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: {} });
    expect((await app.prompted()).typeToConfirm).toBe('notes');
    expect(app.deleteMany).toHaveBeenCalledTimes(1);
    app.decide(true);
    expect(await approvedAll).toMatchObject({ content: [{ text: '4' }] });
    expect(app.deleteMany).toHaveBeenLastCalledWith({});
  });

  it.each(['updateMany', 'deleteMany'])('rejects %s after the connection switches during approval', async (name) => {
    const app = await setup();
    const args = { db: 'sandbox', collection: 'notes', filter: { active: true } };
    const call = app.call(name, name === 'updateMany' ? { ...args, update: { $set: { active: false } } } : args);
    await app.prompted();
    app.switchClient();
    app.decide(true);
    expect(await call).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('connection changed') }],
    });
    expect(app.updateMany).not.toHaveBeenCalled();
    expect(app.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects missing/invalid input and disconnected requests before prompting, and driver errors after approval', async () => {
    const app = await setup();
    expect(await app.call('deleteMany', { db: 'sandbox', collection: 'notes' })).toMatchObject({ isError: true });
    expect(await app.call('updateMany', { db: 'sandbox', collection: 'notes', filter: {}, update: [1] })).toMatchObject(
      { isError: true }
    );
    expect(
      await app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: { _id: { $oid: 'invalid' } } })
    ).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('Invalid EJSON') }] });
    expect(app.requests).toEqual([]);
    app.deleteMany.mockRejectedValueOnce(new Error('delete failed'));
    const call = app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: { active: true } });
    await app.prompted();
    app.decide(true);
    expect(await call).toMatchObject({ isError: true, content: [{ text: 'delete failed' }] });
    app.disconnect();
    expect(await app.call('deleteMany', { db: 'sandbox', collection: 'notes', filter: {} })).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('Not connected') }],
    });
    expect(app.requests).toHaveLength(1);
  });
});
