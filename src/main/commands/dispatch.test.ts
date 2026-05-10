import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection, ConnectionManager } from '../connection-manager';
import { createDispatcher, type MongoCommand } from './dispatch';

function makeManager(active: ActiveConnection | null): ConnectionManager {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn(),
    getActive: () => active,
    onStateChange: vi.fn().mockReturnValue(() => {}),
  };
}

const fakeClient = {} as MongoClient;
const fakeActive: ActiveConnection = { client: fakeClient, key: 'localhost:27017' };

describe('createDispatcher', () => {
  it('returns Not connected when manager has no ActiveConnection', async () => {
    const dispatch = createDispatcher(makeManager(null));
    const run = vi.fn();
    const cmd: MongoCommand<z.ZodObject<Record<string, never>>, number> = {
      name: 'noop',
      ipcChannel: 'mongo:noop',
      mcpToolName: 'noop',
      input: z.object({}),
      run,
    };
    const result = await dispatch(cmd, {});
    expect(result).toEqual({ ok: false, error: 'Not connected' });
    expect(run).not.toHaveBeenCalled();
  });

  it('returns ok=false with formatted error when Zod validation fails', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const run = vi.fn();
    const cmd = {
      name: 'x',
      ipcChannel: 'mongo:x',
      mcpToolName: 'x',
      input: z.object({ db: z.string() }),
      run,
    };
    const result = await dispatch(cmd, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('db');
    expect(run).not.toHaveBeenCalled();
  });

  it('passes ActiveConnection and parsed input to run()', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const run = vi.fn().mockResolvedValue(42);
    const cmd = {
      name: 'count',
      ipcChannel: 'mongo:count',
      mcpToolName: 'count',
      input: z.object({ db: z.string(), collection: z.string() }),
      run,
    };
    const result = await dispatch(cmd, { db: 'testdb', collection: 'users' });
    expect(result).toEqual({ ok: true, data: 42 });
    expect(run).toHaveBeenCalledWith(fakeActive, { db: 'testdb', collection: 'users' });
  });

  it('EJSON.deserializes the whole input before passing to run()', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const run = vi.fn().mockResolvedValue(0);
    const cmd = {
      name: 'count',
      ipcChannel: 'mongo:count',
      mcpToolName: 'count',
      input: z.object({
        db: z.string(),
        filter: z.record(z.string(), z.unknown()).optional(),
      }),
      run,
    };
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    await dispatch(cmd, {
      db: 'testdb',
      filter: { _id: { $oid: '507f1f77bcf86cd799439011' } },
    });
    expect(run).toHaveBeenCalledWith(fakeActive, { db: 'testdb', filter: { _id: oid } });
  });

  it('EJSON.serializes object output (round-trips ObjectId)', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const oid = new ObjectId('507f1f77bcf86cd799439011');
    const cmd = {
      name: 'find',
      ipcChannel: 'mongo:find',
      mcpToolName: 'find',
      input: z.object({}),
      run: async () => ({ doc: { _id: oid, name: 'a' } }),
    };
    const result = await dispatch(cmd, {});
    expect(result).toEqual({
      ok: true,
      data: { doc: { _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'a' } },
    });
  });

  it('passes scalar output through unchanged', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const cmd = {
      name: 'count',
      ipcChannel: 'mongo:count',
      mcpToolName: 'count',
      input: z.object({}),
      run: async () => 42,
    };
    const result = await dispatch(cmd, {});
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('passes undefined output through unchanged', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const cmd = {
      name: 'drop',
      ipcChannel: 'mongo:drop',
      mcpToolName: 'drop',
      input: z.object({}),
      run: async () => undefined,
    };
    const result = await dispatch(cmd, {});
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('catches throws from run() and returns Result error', async () => {
    const dispatch = createDispatcher(makeManager(fakeActive));
    const cmd = {
      name: 'x',
      ipcChannel: 'mongo:x',
      mcpToolName: 'x',
      input: z.object({}),
      run: async () => {
        throw new Error('boom');
      },
    };
    const result = await dispatch(cmd, {});
    expect(result).toEqual({ ok: false, error: 'boom' });
  });
});
