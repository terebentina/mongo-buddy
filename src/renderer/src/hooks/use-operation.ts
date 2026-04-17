import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  OperationKind,
  OperationStatus,
  OperationId,
  OperationParams,
  OperationResult,
  OperationRecord,
  OperationProgress,
} from '../../../shared/types';

type ParamsFor<K extends OperationKind> = Extract<OperationParams, { kind: K }>;
type ResultFor<K extends OperationKind> = Extract<OperationResult, { kind: K }>;

interface OperationStoreState {
  records: Record<OperationId, OperationRecord>;
}

export const useOperationStore = create<OperationStoreState>(() => ({ records: {} }));

let unsubscribe: (() => void) | null = null;

export function subscribeOperationStream(): void {
  if (unsubscribe) return;
  unsubscribe = window.api.onOperationUpdate((rec) => {
    useOperationStore.setState((s) => ({
      records: { ...s.records, [rec.id]: rec },
    }));
  });
}

export function resetOperationStore(): void {
  unsubscribe?.();
  unsubscribe = null;
  useOperationStore.setState({ records: {} });
}

function isTerminal(status: OperationStatus): boolean {
  return status !== 'pending' && status !== 'running';
}

export function waitForTerminal(id: OperationId): Promise<OperationRecord> {
  const current = useOperationStore.getState().records[id];
  if (current && isTerminal(current.status)) return Promise.resolve(current);
  return new Promise((resolve) => {
    const unsub = useOperationStore.subscribe((state) => {
      const rec = state.records[id];
      if (rec && isTerminal(rec.status)) {
        unsub();
        resolve(rec);
      }
    });
  });
}

const EMPTY_PROGRESS: OperationProgress = { processed: 0 };

interface UseOperationReturn<K extends OperationKind> {
  start: (params: ParamsFor<K>) => Promise<OperationId | null>;
  cancel: () => Promise<void>;
  status: OperationStatus | 'idle';
  progress: OperationProgress;
  result: ResultFor<K> | null;
  error: string | null;
  reset: () => void;
}

export function useOperation<K extends OperationKind>(kind: K): UseOperationReturn<K> {
  const [id, setId] = useState<OperationId | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const rec = useOperationStore((s) => (id ? (s.records[id] ?? null) : null));

  const start = useCallback(async (params: ParamsFor<K>): Promise<OperationId | null> => {
    setRejection(null);
    setId(null);
    const res = await window.api.operationStart(params);
    if (!res.ok) {
      setRejection(res.error);
      return null;
    }
    setId(res.data);
    return res.data;
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    if (!id) return;
    await window.api.operationCancel(id);
  }, [id]);

  const reset = useCallback((): void => {
    setId(null);
    setRejection(null);
  }, []);

  let status: OperationStatus | 'idle';
  let error: string | null = null;
  let result: ResultFor<K> | null = null;
  let progress: OperationProgress = EMPTY_PROGRESS;

  if (rejection !== null) {
    status = 'rejected';
    error = rejection;
  } else if (id && rec) {
    status = rec.status;
    progress = rec.progress;
    error = rec.error ?? null;
    if (rec.result && rec.result.kind === kind) {
      result = rec.result as ResultFor<K>;
    }
  } else if (id) {
    status = 'pending';
  } else {
    status = 'idle';
  }

  return { start, cancel, status, progress, result, error, reset };
}

export function useOperationById(id: OperationId | null): OperationRecord | null {
  return useOperationStore(useShallow((s) => (id ? (s.records[id] ?? null) : null)));
}
