import { describe, it, expect, vi } from 'vitest';
import { createMcpStatusEmitter } from './status';

describe('createMcpStatusEmitter', () => {
  it('starts with running=false and port=null', () => {
    const emitter = createMcpStatusEmitter();
    expect(emitter.get()).toEqual({ running: false, port: null });
  });

  it('set() updates the current value', () => {
    const emitter = createMcpStatusEmitter();
    emitter.set({ running: true, port: 27099 });
    expect(emitter.get()).toEqual({ running: true, port: 27099 });
  });

  it('subscribe() invokes callback on subsequent set() calls', () => {
    const emitter = createMcpStatusEmitter();
    const cb = vi.fn();
    emitter.subscribe(cb);
    emitter.set({ running: true, port: 27099 });
    emitter.set({ running: false, port: null });
    expect(cb).toHaveBeenNthCalledWith(1, { running: true, port: 27099 });
    expect(cb).toHaveBeenNthCalledWith(2, { running: false, port: null });
  });

  it('subscribe() does not fire for a set() that produces an equal status', () => {
    const emitter = createMcpStatusEmitter();
    const cb = vi.fn();
    emitter.subscribe(cb);
    emitter.set({ running: false, port: null });
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribe() returns an unsubscribe function', () => {
    const emitter = createMcpStatusEmitter();
    const cb = vi.fn();
    const unsubscribe = emitter.subscribe(cb);
    emitter.set({ running: true, port: 27099 });
    unsubscribe();
    emitter.set({ running: false, port: null });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent subscribers', () => {
    const emitter = createMcpStatusEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.subscribe(a);
    emitter.subscribe(b);
    emitter.set({ running: true, port: 1234 });
    expect(a).toHaveBeenCalledWith({ running: true, port: 1234 });
    expect(b).toHaveBeenCalledWith({ running: true, port: 1234 });
  });
});
