import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MongoClient } from 'mongodb';
import { ObjectId } from 'bson';
import type { ConnectionManager, ConnectionState } from '../connection-manager';
import { insertOneCommand } from '../commands/insert-one';
import { createDispatcher } from '../commands/dispatch';
import { MCP_TOOLS } from './mongo-tool-entries';
import { startMcpServer } from './server';
import { createWriteApproval, type WriteProposal } from './write-approval';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  // Node 20 (the project's minimum) does not provide Promise.withResolvers.
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

async function setup(promptUnavailable = false) {
  const inserted: Record<string, unknown>[] = [];
  const existingId = new ObjectId('507f1f77bcf86cd799439011');
  let existing: Record<string, unknown> | null = { _id: existingId, name: 'before', stale: true };
  const insertOne = vi.fn(async (doc: Record<string, unknown>) => {
    inserted.push({ ...doc, _id: 'inserted' });
    return { insertedId: 'inserted' };
  });
  const findOne = vi.fn(async ({ _id }: { _id: unknown }) => {
    if (_id === 'inserted') return inserted.at(-1);
    return _id instanceof ObjectId && _id.equals(existingId) ? existing : null;
  });
  const replaceOne = vi.fn(async ({ _id }: { _id: unknown }, replacement: Record<string, unknown>) => {
    if (_id instanceof ObjectId && _id.equals(existingId) && existing) existing = { ...replacement, _id: existingId };
  });
  const deleteOne = vi.fn(async ({ _id }: { _id: unknown }) => {
    if (_id instanceof ObjectId && _id.equals(existingId)) existing = null;
  });
  const db = vi.fn(() => ({ collection: () => ({ insertOne, findOne, replaceOne, deleteOne }) }));
  const client = { db } as unknown as MongoClient;
  let active: { client: MongoClient; key: string } | null = { client, key: 'localhost:27161' };
  const subscribers = new Set<(state: ConnectionState) => void>();
  const manager = {
    getActive: () => active,
    onStateChange: (cb: (state: ConnectionState) => void) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  } as unknown as ConnectionManager;
  const dispatch = createDispatcher(manager);
  const promptReady = deferred<void>();
  const decision = deferred<boolean>();
  const abortNotified = deferred<void>();
  const requests: WriteProposal[] = [];
  const approval = createWriteApproval(manager, dispatch, {
    request: (proposal, signal) => {
      if (promptUnavailable) throw new Error('MongoBuddy GUI is unavailable');
      requests.push(proposal);
      promptReady.resolve();
      return new Promise<boolean>((resolve, reject) => {
        const abort = (): void => {
          abortNotified.resolve();
          reject(new Error('prompt cancelled'));
        };
        signal.addEventListener('abort', abort, { once: true });
        void decision.promise.then((value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        });
      });
    },
  });
  const server = await startMcpServer({ dispatch, approval, mongoTools: MCP_TOOLS, port: 0 });
  if (!server) throw new Error('MCP server did not start');
  cleanup.push(() => server.close());
  const mcp = new Client({ name: 'approval-test', version: '1' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.actualPort}/mcp`)));
  cleanup.push(() => mcp.close());
  const call = (
    args: unknown = {
      db: 'sandbox',
      collection: 'notes',
      doc: { name: 'review', date: { $date: '2024-01-01T00:00:00Z' } },
    }
  ) => mcp.callTool({ name: 'insertOne', arguments: args as Record<string, unknown> });
  const callSingle = (name: 'updateOne' | 'deleteOne', args: Record<string, unknown>) =>
    mcp.callTool({ name, arguments: args });
  return {
    inserted,
    insertOne,
    replaceOne,
    deleteOne,
    existing: () => existing,
    existingId: existingId.toHexString(),
    requests,
    promptReady: promptReady.promise,
    abortNotified: abortNotified.promise,
    decide: decision.resolve,
    call,
    callSingle,
    approval,
    disconnect: () => {
      active = null;
      subscribers.forEach((cb) => cb({ status: 'disconnected' }));
    },
    switchClient: () => {
      active = { client: { db } as unknown as MongoClient, key: 'localhost:27161' };
      subscribers.forEach((cb) =>
        cb({ status: 'connected', uri: 'mongodb://localhost:27161', connectionKey: 'localhost:27161' })
      );
    },
    url: `http://127.0.0.1:${server.actualPort}/mcp`,
    server,
  };
}

describe('MCP insertOne approval over HTTP', () => {
  it('discovers an explicit write and inserts the exact EJSON document only after one GUI approval', async () => {
    const app = await setup();
    expect(app.server.address).toBe('0.0.0.0');
    const call = app.call();
    await app.promptReady;
    expect(app.inserted).toEqual([]);
    expect(app.requests).toEqual([
      {
        command: 'insertOne',
        connectionKey: 'localhost:27161',
        db: 'sandbox',
        collection: 'notes',
        input: JSON.stringify(
          { db: 'sandbox', collection: 'notes', doc: { name: 'review', date: { $date: '2024-01-01T00:00:00Z' } } },
          null,
          2
        ),
      },
    ]);
    app.decide(true);
    expect(await call).toMatchObject({ content: [{ type: 'text', text: expect.stringContaining('"name":"review"') }] });
    expect(app.inserted).toHaveLength(1);
    expect(app.insertOne).toHaveBeenCalledTimes(1);
    expect(app.inserted[0].date).toBeInstanceOf(Date);
  });

  it('rejects denial and concurrent writes while the first approval is pending', async () => {
    const app = await setup();
    const first = app.call();
    await app.promptReady;
    const second = await app.call();
    expect(second).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('pending') }] });
    app.decide(false);
    expect(await first).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(app.inserted).toEqual([]);
    expect(app.requests).toHaveLength(1);
  });

  it.each(['disconnect', 'switchClient'] as const)(
    'rejects approval after %s, even if the client reconnects',
    async (change) => {
      const app = await setup();
      const call = app.call();
      await app.promptReady;
      app[change]();
      app.decide(true);
      expect(await call).toMatchObject({
        isError: true,
        content: [{ text: expect.stringContaining('connection changed') }],
      });
      expect(app.inserted).toEqual([]);
    }
  );

  it('fails invalid inputs and missing connection without displaying a prompt', async () => {
    const app = await setup();
    expect(await app.call({ db: 'sandbox', collection: 'notes', doc: [] })).toMatchObject({ isError: true });
    expect(app.requests).toEqual([]);
    app.disconnect();
    expect(await app.call()).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('Not connected') }],
    });
    expect(app.requests).toEqual([]);
    expect(app.inserted).toEqual([]);
  });

  it('rejects malformed EJSON before displaying any approval prompt', async () => {
    const app = await setup();
    expect(
      await app.call({ db: 'sandbox', collection: 'notes', doc: { _id: { $oid: 'not-an-object-id' } } })
    ).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('Invalid EJSON') }] });
    expect(app.requests).toEqual([]);
    expect(app.inserted).toEqual([]);
  });

  it('fails closed when GUI prompt cannot open', async () => {
    const app = await setup(true);
    const result = await app.call();
    expect(result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('GUI is unavailable') }] });
    expect(app.inserted).toEqual([]);
  });

  it('cancels pending write on shutdown without executing after a late approval', async () => {
    const app = await setup();
    const call = app.call();
    await app.promptReady;
    app.approval.cancel();
    app.decide(true);
    expect(await call).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('shutting down') }] });
    expect(app.inserted).toEqual([]);
  });

  it('returns the original command driver error after approval', async () => {
    const app = await setup();
    app.insertOne.mockRejectedValueOnce(new Error('E11000 duplicate key'));
    const call = app.call();
    await app.promptReady;
    app.decide(true);
    expect(await call).toMatchObject({ isError: true, content: [{ text: 'E11000 duplicate key' }] });
    expect(app.insertOne).toHaveBeenCalledTimes(1);
    expect(app.inserted).toEqual([]);
  });

  it('does not execute when the HTTP caller aborts while approval is displayed', async () => {
    const app = await setup();
    const controller = new AbortController();
    const call = fetch(app.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/call',
        params: {
          name: 'insertOne',
          arguments: { db: 'sandbox', collection: 'notes', doc: { name: 'cancelled' } },
        },
      }),
      signal: controller.signal,
    });
    await app.promptReady;
    controller.abort();
    await expect(call).rejects.toThrow();
    await app.abortNotified;
    app.decide(true);
    expect(app.inserted).toEqual([]);
  });

  it('expires a pending request even if the GUI does not resolve or honor abort', async () => {
    vi.useFakeTimers();
    try {
      const client = { db: vi.fn() } as unknown as MongoClient;
      const manager = {
        getActive: () => ({ client, key: 'localhost:27161' }),
        onStateChange: () => () => undefined,
      } as unknown as ConnectionManager;
      const dispatch = vi.fn();
      const approval = createWriteApproval(manager, dispatch, { request: () => new Promise<boolean>(() => undefined) });
      const result = approval.execute(
        insertOneCommand,
        { db: 'sandbox', collection: 'notes', doc: { name: 'expired' } },
        new AbortController().signal
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await result).toEqual({ ok: false, error: 'MCP write approval timed out' });
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MCP single-document writes over HTTP', () => {
  it('replaces by EJSON identifier only after approval and returns the stored replacement', async () => {
    const app = await setup();
    const args = {
      db: 'sandbox',
      collection: 'notes',
      id: { $oid: app.existingId },
      doc: { _id: { $oid: '507f1f77bcf86cd799439012' }, name: 'after', at: { $date: '2024-01-01T00:00:00Z' } },
    };
    const call = app.callSingle('updateOne', args);
    await app.promptReady;
    expect(app.replaceOne).not.toHaveBeenCalled();
    expect(app.requests).toEqual([
      {
        command: 'updateOne',
        connectionKey: 'localhost:27161',
        db: 'sandbox',
        collection: 'notes',
        input: JSON.stringify(args, null, 2),
      },
    ]);
    app.decide(true);
    expect(await call).toMatchObject({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ name: 'after', at: { $date: '2024-01-01T00:00:00Z' }, _id: { $oid: app.existingId } }),
        },
      ],
    });
    expect(app.replaceOne).toHaveBeenCalledExactlyOnceWith(
      { _id: new ObjectId(app.existingId) },
      { name: 'after', at: new Date('2024-01-01T00:00:00Z') }
    );
  });

  it('denies deletion without execution and returns valid null text when a later deletion is approved', async () => {
    const denied = await setup();
    const args = { db: 'sandbox', collection: 'notes', id: { $oid: denied.existingId } };
    const first = denied.callSingle('deleteOne', args);
    await denied.promptReady;
    expect(denied.deleteOne).not.toHaveBeenCalled();
    expect(denied.requests).toEqual([
      {
        command: 'deleteOne',
        connectionKey: 'localhost:27161',
        db: 'sandbox',
        collection: 'notes',
        input: JSON.stringify(args, null, 2),
      },
    ]);
    denied.decide(false);
    expect(await first).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('denied') }] });
    expect(denied.existing()).not.toBeNull();
    expect(denied.deleteOne).not.toHaveBeenCalled();

    const approved = await setup();
    const second = approved.callSingle('deleteOne', args);
    await approved.promptReady;
    approved.decide(true);
    expect(await second).toMatchObject({ content: [{ type: 'text', text: 'null' }] });
    expect(approved.deleteOne).toHaveBeenCalledExactlyOnceWith({ _id: new ObjectId(approved.existingId) });
    expect(approved.existing()).toBeNull();
  });

  it('fails closed on connection switch and rejects malformed EJSON before requesting approval', async () => {
    const app = await setup();
    const malformed = { db: 'sandbox', collection: 'notes', id: { $oid: 'invalid' } };
    expect(await app.callSingle('deleteOne', malformed)).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('Invalid EJSON') }],
    });
    expect(app.requests).toEqual([]);
    const call = app.callSingle('updateOne', { ...malformed, id: { $oid: app.existingId }, doc: { name: 'after' } });
    await app.promptReady;
    app.switchClient();
    app.decide(true);
    expect(await call).toMatchObject({
      isError: true,
      content: [{ text: expect.stringContaining('connection changed') }],
    });
    expect(app.replaceOne).not.toHaveBeenCalled();
  });

  it('returns driver errors after approval without disguising them as successful writes', async () => {
    const app = await setup();
    app.deleteOne.mockRejectedValueOnce(new Error('database write failed'));
    const call = app.callSingle('deleteOne', {
      db: 'sandbox',
      collection: 'notes',
      id: { $oid: app.existingId },
    });
    await app.promptReady;
    app.decide(true);
    expect(await call).toMatchObject({ isError: true, content: [{ text: 'database write failed' }] });
    expect(app.existing()).not.toBeNull();
  });
});
