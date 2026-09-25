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
  const createCollection = vi.fn().mockResolvedValue(undefined);
  const renameCollection = vi.fn().mockResolvedValue(undefined);
  const dropCollection = vi.fn().mockResolvedValue(true);
  const createIndex = vi.fn().mockResolvedValue('email_1');
  const dropIndex = vi.fn().mockResolvedValue(undefined);
  const db = vi.fn(() => ({
    createCollection,
    renameCollection,
    dropCollection,
    collection: () => ({ updateMany, deleteMany, createIndex, dropIndex }),
  }));
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
    createCollection,
    renameCollection,
    dropCollection,
    createIndex,
    dropIndex,
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
    expect(proposal).toMatchObject({
      command: 'updateMany',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'notes',
    });
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
  it('creates and renames only after click approval, showing exact old and new names and returning valid void results', async () => {
    const app = await setup();
    const create = app.call('createCollection', { db: 'sandbox', collection: 'events' });
    expect(await app.prompted()).toMatchObject({
      command: 'createCollection',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'events',
      input: JSON.stringify({ db: 'sandbox', collection: 'events' }, null, 2),
    });
    expect(app.createCollection).not.toHaveBeenCalled();
    app.decide(true);
    expect(await create).toMatchObject({ content: [{ text: 'null' }] });
    expect(app.createCollection).toHaveBeenCalledExactlyOnceWith('events');

    const rename = app.call('renameCollection', { db: 'sandbox', from: 'events', to: 'archive' });
    expect(await app.prompted()).toMatchObject({
      command: 'renameCollection',
      connectionKey: 'local',
      db: 'sandbox',
      collection: '"events" → "archive"',
      input: JSON.stringify({ db: 'sandbox', from: 'events', to: 'archive' }, null, 2),
    });
    expect(app.renameCollection).not.toHaveBeenCalled();
    app.decide(true);
    expect(await rename).toMatchObject({ content: [{ text: 'null' }] });
    expect(app.renameCollection).toHaveBeenCalledExactlyOnceWith('events', 'archive');
  });

  it('requires collection-name proposals for empty/drop and does not execute denied destructive writes', async () => {
    const app = await setup();
    const denied = app.call('dropCollection', { db: 'sandbox', collection: 'notes' });
    expect(await app.prompted()).toMatchObject({
      command: 'dropCollection',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'notes',
      typeToConfirm: 'notes',
    });
    app.decide(false);
    expect(await denied).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.dropCollection).not.toHaveBeenCalled();

    const empty = app.call('emptyCollection', { db: 'sandbox', collection: 'notes' });
    expect(await app.prompted()).toMatchObject({
      command: 'emptyCollection',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'notes',
      input: JSON.stringify({ db: 'sandbox', collection: 'notes' }, null, 2),
      typeToConfirm: 'notes',
    });
    expect(app.deleteMany).not.toHaveBeenCalled();
    app.decide(true);
    expect(await empty).toMatchObject({ content: [{ text: '4' }] });
    expect(app.deleteMany).toHaveBeenCalledExactlyOnceWith({});

    app.dropCollection.mockRejectedValueOnce(new Error('drop permission denied'));
    const drop = app.call('dropCollection', { db: 'sandbox', collection: 'notes' });
    await app.prompted();
    app.decide(true);
    expect(await drop).toMatchObject({ isError: true, content: [{ text: 'drop permission denied' }] });
    const success = app.call('dropCollection', { db: 'sandbox', collection: 'notes' });
    await app.prompted();
    app.decide(true);
    expect(await success).toMatchObject({ content: [{ text: 'null' }] });
  });

  it('types the database name for batch drop and reports individual successes and failures after approval', async () => {
    const app = await setup();
    app.dropCollection.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('not authorized'));
    const names = ['events', 'archive'];
    const call = app.call('dropCollections', { db: 'sandbox', names });
    expect(await app.prompted()).toMatchObject({
      command: 'dropCollections',
      connectionKey: 'local',
      db: 'sandbox',
      collection: '["events","archive"]',
      typeToConfirm: 'sandbox',
      input: JSON.stringify({ db: 'sandbox', names }, null, 2),
    });
    expect(app.dropCollection).not.toHaveBeenCalled();
    app.decide(true);
    expect(await call).toMatchObject({
      content: [{ text: '{"dropped":["events"],"failed":[{"name":"archive","error":"not authorized"}]}' }],
    });
    expect(app.dropCollection).toHaveBeenCalledTimes(2);
  });

  it('rejects a collection write after connection switch, even if approval arrives later', async () => {
    const app = await setup();
    const call = app.call('emptyCollection', { db: 'sandbox', collection: 'notes' });
    await app.prompted();
    app.switchClient();
    app.decide(true);
    expect(await call).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('connection changed') }],
    });
    expect(app.deleteMany).not.toHaveBeenCalled();
  });

  it('creates an index only after approval and preserves the driver-assigned name and options', async () => {
    const app = await setup();
    const args = {
      db: 'sandbox',
      collection: 'notes',
      key: { email: 1, createdAt: -1 },
      indexName: 'unique_email',
      unique: true,
    };
    app.createIndex.mockResolvedValueOnce('unique_email');
    const call = app.call('createIndex', args);
    expect(await app.prompted()).toMatchObject({
      command: 'createIndex',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'notes',
      input: JSON.stringify(args, null, 2),
    });
    expect(app.createIndex).not.toHaveBeenCalled();
    app.decide(true);
    expect(await call).toMatchObject({ content: [{ text: '"unique_email"' }] });
    expect(app.createIndex).toHaveBeenCalledExactlyOnceWith(args.key, { name: 'unique_email', unique: true });
  });

  it('returns index validation errors from the driver after approving an otherwise valid input', async () => {
    const app = await setup();
    app.createIndex.mockRejectedValueOnce(new Error('Invalid index specification'));
    const args = { db: 'sandbox', collection: 'notes', key: { email: 3 }, unique: false };
    const call = app.call('createIndex', args);
    expect((await app.prompted()).input).toBe(JSON.stringify(args, null, 2));
    app.decide(true);
    expect(await call).toMatchObject({ isError: true, content: [{ text: 'Invalid index specification' }] });
    expect(app.createIndex).toHaveBeenCalledExactlyOnceWith({ email: 3 }, { unique: false });
  });

  it('denies index creation and refuses an approved index drop after connection switch', async () => {
    const app = await setup();
    const create = app.call('createIndex', {
      db: 'sandbox',
      collection: 'notes',
      key: { email: 1 },
      unique: false,
    });
    await app.prompted();
    app.decide(false);
    expect(await create).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.createIndex).not.toHaveBeenCalled();

    const drop = app.call('dropIndex', { db: 'sandbox', collection: 'notes', indexName: 'email_1' });
    await app.prompted();
    app.switchClient();
    app.decide(true);
    expect(await drop).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('connection changed') }],
    });
    expect(app.dropIndex).not.toHaveBeenCalled();
  });

  it('drops a named index after approval with valid void text, but protects _id_ and reports driver rejection', async () => {
    const app = await setup();
    const args = { db: 'sandbox', collection: 'notes', indexName: 'email_1' };
    const denied = app.call('dropIndex', args);
    await app.prompted();
    app.decide(false);
    expect(await denied).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.dropIndex).not.toHaveBeenCalled();

    const drop = app.call('dropIndex', args);
    expect(await app.prompted()).toMatchObject({
      command: 'dropIndex',
      connectionKey: 'local',
      db: 'sandbox',
      collection: 'notes',
      input: JSON.stringify(args, null, 2),
    });
    expect(app.dropIndex).not.toHaveBeenCalled();
    app.decide(true);
    expect(await drop).toMatchObject({ content: [{ text: 'null' }] });
    expect(app.dropIndex).toHaveBeenCalledExactlyOnceWith('email_1');

    const protectedDrop = app.call('dropIndex', { ...args, indexName: '_id_' });
    await app.prompted();
    app.decide(true);
    expect(await protectedDrop).toMatchObject({
      isError: true,
      content: [{ text: 'Cannot drop the _id_ index' }],
    });
    expect(app.dropIndex).toHaveBeenCalledTimes(1);

    app.dropIndex.mockRejectedValueOnce(new Error('index not found'));
    const rejected = app.call('dropIndex', args);
    await app.prompted();
    app.decide(true);
    expect(await rejected).toMatchObject({ isError: true, content: [{ text: 'index not found' }] });
  });
});
