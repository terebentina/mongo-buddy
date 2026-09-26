import type { McpStatus } from '../../shared/types';

export interface McpStatusEmitter {
  get: () => McpStatus;
  set: (next: McpStatus) => void;
  subscribe: (cb: (s: McpStatus) => void) => () => void;
}

const INITIAL: McpStatus = { running: false, port: null };

export function createMcpStatusEmitter(): McpStatusEmitter {
  let current: McpStatus = INITIAL;
  const subscribers = new Set<(s: McpStatus) => void>();

  return {
    get: () => current,
    set: (next: McpStatus) => {
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
