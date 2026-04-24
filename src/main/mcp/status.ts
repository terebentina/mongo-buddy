import type { McpStatus } from '../../shared/types';

export interface McpStatusEmitter {
  get: () => McpStatus;
  set: (next: McpStatus) => void;
  subscribe: (cb: (s: McpStatus) => void) => () => void;
}

const INITIAL: McpStatus = { running: false, port: null };

function equals(a: McpStatus, b: McpStatus): boolean {
  return a.running === b.running && a.port === b.port;
}

export function createMcpStatusEmitter(): McpStatusEmitter {
  let current: McpStatus = INITIAL;
  const subscribers = new Set<(s: McpStatus) => void>();

  return {
    get: () => current,
    set: (next: McpStatus) => {
      if (equals(current, next)) return;
      current = next;
      for (const cb of subscribers) cb(current);
    },
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
