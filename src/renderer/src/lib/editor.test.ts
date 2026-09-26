import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { undoDepth } from '@codemirror/commands';
import { baseExtensions } from './editor';

describe('baseExtensions', () => {
  it('wires history so undoDepth increases after a change', () => {
    const state = EditorState.create({ doc: 'hello', extensions: baseExtensions() });
    expect(undoDepth(state)).toBe(0);
    const after = state.update({ changes: { from: 5, insert: '!' } }).state;
    expect(after.doc.toString()).toBe('hello!');
    expect(undoDepth(after)).toBeGreaterThan(0);
  });
});
