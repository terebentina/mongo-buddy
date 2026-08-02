import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

global.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// jsdom doesn't support Element.getAnimations() used by @base-ui/react ScrollArea
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

// Node's own experimental `localStorage` global occupies the slot jsdom's Storage
// would take, and is undefined unless node runs with --localstorage-file.
if (!globalThis.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
});
