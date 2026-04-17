import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useOperation,
  useOperationById,
  subscribeOperationStream,
  resetOperationStore,
  waitForTerminal,
} from './use-operation';
import type { OperationRecord } from '../../../shared/types';

type Listener = (rec: OperationRecord) => void;
let listeners: Listener[] = [];

function emit(rec: OperationRecord): void {
  for (const l of [...listeners]) l(rec);
}

const mockApi = {
  operationStart: vi.fn(),
  operationCancel: vi.fn(),
  onOperationUpdate: vi.fn((cb: Listener) => {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  }),
};

beforeEach(() => {
  listeners = [];
  vi.clearAllMocks();
  mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-1' });
  mockApi.operationCancel.mockResolvedValue({ ok: true, data: undefined });
  mockApi.onOperationUpdate.mockImplementation((cb: Listener) => {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  });
  (window as unknown as { api: typeof mockApi }).api = mockApi;
  resetOperationStore();
  subscribeOperationStream();
});

describe('useOperation', () => {
  it('returns idle state initially', () => {
    const { result } = renderHook(() => useOperation('export-collection'));
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toEqual({ processed: 0 });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('start() returns the operation id', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-42' });
    const { result } = renderHook(() => useOperation('export-collection'));
    let id: string | null = null;
    await act(async () => {
      id = await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    expect(id).toBe('op-42');
    expect(mockApi.operationStart).toHaveBeenCalledWith({
      kind: 'export-collection',
      db: 'd',
      collection: 'c',
    });
  });

  it('reflects progress updates in state', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-7' });
    const { result } = renderHook(() => useOperation('export-collection'));
    await act(async () => {
      await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    act(() => {
      emit({
        id: 'op-7',
        params: { kind: 'export-collection', db: 'd', collection: 'c' },
        status: 'running',
        progress: { processed: 100 },
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('running');
      expect(result.current.progress.processed).toBe(100);
    });
  });

  it('reflects terminal state with typed result', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-1' });
    const { result } = renderHook(() => useOperation('export-collection'));
    await act(async () => {
      await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    act(() => {
      emit({
        id: 'op-1',
        params: { kind: 'export-collection', db: 'd', collection: 'c' },
        status: 'succeeded',
        progress: { processed: 500 },
        result: { kind: 'export-collection', exported: 500, path: '/tmp/x.bson.gz' },
      });
    });
    await waitFor(() => {
      expect(result.current.status).toBe('succeeded');
      expect(result.current.result).toEqual({
        kind: 'export-collection',
        exported: 500,
        path: '/tmp/x.bson.gz',
      });
    });
  });

  it('surfaces rejection when start returns ok:false; start returns null', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: false, error: 'already in progress' });
    const { result } = renderHook(() => useOperation('export-collection'));
    let id: string | null = 'unset' as string | null;
    await act(async () => {
      id = await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    expect(id).toBeNull();
    await waitFor(() => {
      expect(result.current.status).toBe('rejected');
      expect(result.current.error).toBe('already in progress');
    });
  });

  it('cancel() calls api.operationCancel with current id', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-9' });
    const { result } = renderHook(() => useOperation('export-collection'));
    await act(async () => {
      await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    await act(async () => {
      await result.current.cancel();
    });
    expect(mockApi.operationCancel).toHaveBeenCalledWith('op-9');
  });

  it('cancel() is a no-op when no op started', async () => {
    const { result } = renderHook(() => useOperation('export-collection'));
    await act(async () => {
      await result.current.cancel();
    });
    expect(mockApi.operationCancel).not.toHaveBeenCalled();
  });

  it('reset() returns the hook to idle', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-1' });
    const { result } = renderHook(() => useOperation('export-collection'));
    await act(async () => {
      await result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    act(() => {
      emit({
        id: 'op-1',
        params: { kind: 'export-collection', db: 'd', collection: 'c' },
        status: 'succeeded',
        progress: { processed: 10 },
        result: { kind: 'export-collection', exported: 10, path: '/x' },
      });
    });
    await waitFor(() => expect(result.current.status).toBe('succeeded'));
    act(() => {
      result.current.reset();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('idle');
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  it('two hooks watching the same id share state (via store)', async () => {
    mockApi.operationStart.mockResolvedValue({ ok: true, data: 'op-shared' });
    const a = renderHook(() => useOperation('export-collection'));
    const b = renderHook(() => useOperationById('op-shared'));
    await act(async () => {
      await a.result.current.start({ kind: 'export-collection', db: 'd', collection: 'c' });
    });
    act(() => {
      emit({
        id: 'op-shared',
        params: { kind: 'export-collection', db: 'd', collection: 'c' },
        status: 'running',
        progress: { processed: 42 },
      });
    });
    await waitFor(() => {
      expect(a.result.current.progress.processed).toBe(42);
      expect(b.result.current?.progress.processed).toBe(42);
    });
  });

  it('subscribeOperationStream subscribes only once', () => {
    subscribeOperationStream();
    subscribeOperationStream();
    expect(mockApi.onOperationUpdate).toHaveBeenCalledTimes(1);
  });

  it('progress on a new start replaces previous op state', async () => {
    mockApi.operationStart.mockResolvedValueOnce({ ok: true, data: 'op-a' });
    const { result } = renderHook(() => useOperation('import-collection'));
    await act(async () => {
      await result.current.start({
        kind: 'import-collection',
        db: 'd',
        collection: 'c',
        filePath: '/a',
        options: { onDuplicate: 'skip', clearFirst: false },
      });
    });
    act(() => {
      emit({
        id: 'op-a',
        params: {
          kind: 'import-collection',
          db: 'd',
          collection: 'c',
          filePath: '/a',
          options: { onDuplicate: 'skip', clearFirst: false },
        },
        status: 'succeeded',
        progress: { processed: 5 },
        result: { kind: 'import-collection', inserted: 5, skipped: 0 },
      });
    });
    mockApi.operationStart.mockResolvedValueOnce({ ok: true, data: 'op-b' });
    await act(async () => {
      await result.current.start({
        kind: 'import-collection',
        db: 'd',
        collection: 'c',
        filePath: '/b',
        options: { onDuplicate: 'skip', clearFirst: false },
      });
    });
    await waitFor(() => {
      // new op: no record yet, should be pending, result cleared
      expect(result.current.status).toBe('pending');
      expect(result.current.result).toBeNull();
    });
  });
});

describe('waitForTerminal', () => {
  it('resolves with the terminal record when it arrives', async () => {
    const p = waitForTerminal('op-x');
    emit({
      id: 'op-x',
      params: { kind: 'export-collection', db: 'd', collection: 'c' },
      status: 'running',
      progress: { processed: 1 },
    });
    emit({
      id: 'op-x',
      params: { kind: 'export-collection', db: 'd', collection: 'c' },
      status: 'succeeded',
      progress: { processed: 10 },
      result: { kind: 'export-collection', exported: 10, path: '/x' },
    });
    const rec = await p;
    expect(rec.status).toBe('succeeded');
    expect(rec.id).toBe('op-x');
  });

  it('resolves immediately if record already terminal', async () => {
    emit({
      id: 'op-y',
      params: { kind: 'export-collection', db: 'd', collection: 'c' },
      status: 'cancelled',
      progress: { processed: 3 },
    });
    const rec = await waitForTerminal('op-y');
    expect(rec.status).toBe('cancelled');
  });
});
