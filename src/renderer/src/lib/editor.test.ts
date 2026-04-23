import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { undoDepth } from '@codemirror/commands';
import { baseExtensions, isDarkMode } from './editor';

describe('isDarkMode', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('returns false when documentElement lacks "dark" class', () => {
    expect(isDarkMode()).toBe(false);
  });

  it('returns true when documentElement has "dark" class', () => {
    document.documentElement.classList.add('dark');
    expect(isDarkMode()).toBe(true);
  });
});

describe('baseExtensions', () => {
  it('returns a non-empty extension array', () => {
    const exts = baseExtensions();
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(0);
  });

  it('wires history so undoDepth increases after a change', () => {
    const state = EditorState.create({ doc: 'hello', extensions: baseExtensions() });
    expect(undoDepth(state)).toBe(0);
    const after = state.update({ changes: { from: 5, insert: '!' } }).state;
    expect(after.doc.toString()).toBe('hello!');
    expect(undoDepth(after)).toBeGreaterThan(0);
  });

  it('includes Mod-z in the keymap facet (historyKeymap)', () => {
    const state = EditorState.create({ extensions: baseExtensions() });
    const bindings = state.facet(keymap).flat();
    expect(bindings.some((b) => b.key === 'Mod-z')).toBe(true);
  });

  it('includes Mod-f in the keymap facet (searchKeymap)', () => {
    const state = EditorState.create({ extensions: baseExtensions() });
    const bindings = state.facet(keymap).flat();
    expect(bindings.some((b) => b.key === 'Mod-f')).toBe(true);
  });

  it('places extraKeymaps before default bindings', () => {
    const state = EditorState.create({
      extensions: baseExtensions({
        extraKeymaps: [{ key: 'Mod-Enter', run: () => true }],
      }),
    });
    const bindings = state.facet(keymap).flat();
    const customIdx = bindings.findIndex((b) => b.key === 'Mod-Enter');
    const historyIdx = bindings.findIndex((b) => b.key === 'Mod-z');
    expect(customIdx).toBeGreaterThanOrEqual(0);
    expect(historyIdx).toBeGreaterThanOrEqual(0);
    expect(customIdx).toBeLessThan(historyIdx);
  });
});
