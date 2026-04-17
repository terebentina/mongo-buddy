import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {},
}));

import { createApi } from './index';
import type { ConnectionState, ConnectedSession } from '../main/connection-manager';

describe('preload createApi', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let on: ReturnType<typeof vi.fn>;
  let off: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ipcRenderer: any;

  beforeEach(() => {
    invoke = vi.fn();
    on = vi.fn();
    off = vi.fn();
    ipcRenderer = { invoke, on, off };
  });

  describe('connect', () => {
    it('invokes mongo:connect with uri and forwards the ConnectedSession result', async () => {
      const session: ConnectedSession = {
        uri: 'mongodb://localhost:27017',
        connectionKey: 'key-1',
        databases: [{ name: 'db1', sizeOnDisk: 100, empty: false }],
        queryHistory: [],
        autoSelectedDb: 'db1',
        collections: [],
      };
      invoke.mockResolvedValue({ ok: true, data: session });
      const api = createApi(ipcRenderer);

      const result = await api.connect('mongodb://localhost:27017');

      expect(invoke).toHaveBeenCalledWith('mongo:connect', 'mongodb://localhost:27017', undefined);
      expect(result).toEqual({ ok: true, data: session });
    });

    it('forwards ConnectOptions to the main process', async () => {
      invoke.mockResolvedValue({ ok: false, error: 'boom' });
      const api = createApi(ipcRenderer);

      await api.connect('mongodb://localhost:27017', {
        autoSelectSingleDb: false,
        persistAsLastUsed: false,
        loadHistory: false,
      });

      expect(invoke).toHaveBeenCalledWith('mongo:connect', 'mongodb://localhost:27017', {
        autoSelectSingleDb: false,
        persistAsLastUsed: false,
        loadHistory: false,
      });
    });
  });

  describe('onConnectionState', () => {
    it('registers a listener on connection:state and forwards the state payload', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      api.onConnectionState(cb);

      expect(on).toHaveBeenCalledTimes(1);
      const [channel, handler] = on.mock.calls[0];
      expect(channel).toBe('connection:state');

      const state: ConnectionState = { status: 'connecting', uri: 'mongodb://localhost' };
      (handler as (event: unknown, data: ConnectionState) => void)({}, state);

      expect(cb).toHaveBeenCalledWith(state);
    });

    it('returns an unsubscribe function that removes the exact listener via ipcRenderer.off', () => {
      const api = createApi(ipcRenderer);
      const cb = vi.fn();

      const unsubscribe = api.onConnectionState(cb);
      const registeredHandler = on.mock.calls[0][1];

      unsubscribe();

      expect(off).toHaveBeenCalledWith('connection:state', registeredHandler);
    });

    it('does not leak listeners: handler registered via on matches the one passed to off', () => {
      const api = createApi(ipcRenderer);

      const unsub1 = api.onConnectionState(vi.fn());
      const unsub2 = api.onConnectionState(vi.fn());

      const handler1 = on.mock.calls[0][1];
      const handler2 = on.mock.calls[1][1];
      expect(handler1).not.toBe(handler2);

      unsub1();
      unsub2();

      expect(off).toHaveBeenNthCalledWith(1, 'connection:state', handler1);
      expect(off).toHaveBeenNthCalledWith(2, 'connection:state', handler2);
    });
  });
});
