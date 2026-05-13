import { describe, it, expect } from 'vitest';
import { extractLabelDisplay } from './DocumentEditor.helpers';

describe('extractLabelDisplay', () => {
  it('returns name when present', () => {
    expect(extractLabelDisplay({ name: 'Acme' })).toEqual({ field: 'name', value: 'Acme' });
  });

  it('returns title when name is absent', () => {
    expect(extractLabelDisplay({ title: 'Hello' })).toEqual({ field: 'title', value: 'Hello' });
  });

  it('prefers name over title when both present', () => {
    expect(extractLabelDisplay({ name: 'A', title: 'B' })).toEqual({ field: 'name', value: 'A' });
  });

  it('falls through to title when name is a number', () => {
    expect(extractLabelDisplay({ name: 42, title: 'B' })).toEqual({ field: 'title', value: 'B' });
  });

  it('falls through to title when name is an object', () => {
    expect(extractLabelDisplay({ name: { foo: 1 }, title: 'B' })).toEqual({ field: 'title', value: 'B' });
  });

  it('falls through to title when name is null', () => {
    expect(extractLabelDisplay({ name: null, title: 'B' })).toEqual({ field: 'title', value: 'B' });
  });

  it('falls through to title when name is empty string', () => {
    expect(extractLabelDisplay({ name: '', title: 'B' })).toEqual({ field: 'title', value: 'B' });
  });

  it('falls through to title when name is whitespace only', () => {
    expect(extractLabelDisplay({ name: '   ', title: 'B' })).toEqual({ field: 'title', value: 'B' });
  });

  it('returns null when neither field present', () => {
    expect(extractLabelDisplay({ _id: 'x', foo: 'bar' })).toBeNull();
  });

  it('returns null when both are non-string', () => {
    expect(extractLabelDisplay({ name: 1, title: { x: 1 } })).toBeNull();
  });

  it('returns null when title is also empty/whitespace', () => {
    expect(extractLabelDisplay({ name: '', title: '  ' })).toBeNull();
  });
});
