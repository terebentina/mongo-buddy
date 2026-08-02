import { describe, it, expect } from 'vitest';
import {
  isEjsonWrapper,
  isCopyableCell,
  formatValueForCopy,
  formatValueForCellCopy,
  buildValuesCopyText,
  buildColumnCopyText,
} from './clipboard';

describe('isCopyableCell', () => {
  it('is true for non-empty primitives', () => {
    expect(isCopyableCell('hello')).toBe(true);
    expect(isCopyableCell(42)).toBe(true);
    expect(isCopyableCell(0)).toBe(true);
    expect(isCopyableCell(false)).toBe(true);
  });

  it('is false when the cell displays nothing', () => {
    expect(isCopyableCell(null)).toBe(false);
    expect(isCopyableCell(undefined)).toBe(false);
    expect(isCopyableCell('')).toBe(false);
  });

  it('is true for EJSON scalars', () => {
    expect(isCopyableCell({ $oid: '507f1f77bcf86cd799439011' })).toBe(true);
    expect(isCopyableCell({ $date: '2024-01-01T00:00:00Z' })).toBe(true);
  });

  it('is false for an EJSON scalar with no visible text', () => {
    expect(isCopyableCell({ $oid: '' })).toBe(false);
  });

  it('is false for EJSON wrappers that display as JSON', () => {
    expect(isCopyableCell({ $numberLong: '1' })).toBe(false);
    expect(isCopyableCell({ $regex: 'a', $options: 'i' })).toBe(false);
  });

  it('is false for objects and arrays', () => {
    expect(isCopyableCell({ a: 1 })).toBe(false);
    expect(isCopyableCell({})).toBe(false);
    expect(isCopyableCell([1, 2])).toBe(false);
  });
});

describe('isEjsonWrapper', () => {
  it('is true for $oid wrapper', () => {
    expect(isEjsonWrapper({ $oid: 'x' })).toBe(true);
  });

  it('is true for $date wrapper', () => {
    expect(isEjsonWrapper({ $date: '2024-01-01T00:00:00Z' })).toBe(true);
  });

  it('is true for $regex with $options (two $-prefixed keys)', () => {
    expect(isEjsonWrapper({ $regex: 'a', $options: 'i' })).toBe(true);
  });

  it('is true for $numberLong', () => {
    expect(isEjsonWrapper({ $numberLong: '1' })).toBe(true);
  });

  it('is false for empty object', () => {
    expect(isEjsonWrapper({})).toBe(false);
  });

  it('is false for plain object', () => {
    expect(isEjsonWrapper({ a: 1 })).toBe(false);
  });

  it('is false for object mixing $-key and plain key', () => {
    expect(isEjsonWrapper({ $oid: 'x', extra: 1 })).toBe(false);
  });

  it('is false for arrays', () => {
    expect(isEjsonWrapper([])).toBe(false);
    expect(isEjsonWrapper([{ $oid: 'x' }])).toBe(false);
  });

  it('is false for null and primitives', () => {
    expect(isEjsonWrapper(null)).toBe(false);
    expect(isEjsonWrapper(undefined)).toBe(false);
    expect(isEjsonWrapper('hello')).toBe(false);
    expect(isEjsonWrapper(42)).toBe(false);
    expect(isEjsonWrapper(true)).toBe(false);
  });
});

describe('formatValueForCopy', () => {
  it('formats string as quoted primitive', () => {
    expect(formatValueForCopy('hello')).toEqual({ text: '"hello"', kind: 'primitive' });
  });

  it('formats number as primitive', () => {
    expect(formatValueForCopy(42)).toEqual({ text: '42', kind: 'primitive' });
  });

  it('formats boolean as primitive', () => {
    expect(formatValueForCopy(true)).toEqual({ text: 'true', kind: 'primitive' });
  });

  it('formats null as primitive null', () => {
    expect(formatValueForCopy(null)).toEqual({ text: 'null', kind: 'primitive' });
  });

  it('formats undefined as primitive null', () => {
    expect(formatValueForCopy(undefined)).toEqual({ text: 'null', kind: 'primitive' });
  });

  it('formats $oid wrapper as its quoted inner value', () => {
    expect(formatValueForCopy({ $oid: '507f1f77bcf86cd799439011' })).toEqual({
      text: '"507f1f77bcf86cd799439011"',
      kind: 'primitive',
    });
  });

  it('formats $date wrapper as its quoted inner value', () => {
    expect(formatValueForCopy({ $date: '2024-01-01T00:00:00Z' })).toEqual({
      text: '"2024-01-01T00:00:00Z"',
      kind: 'primitive',
    });
  });

  it('formats a non-scalar EJSON wrapper as primitive raw EJSON', () => {
    expect(formatValueForCopy({ $numberLong: '123' })).toEqual({
      text: '{"$numberLong":"123"}',
      kind: 'primitive',
    });
  });

  it('formats plain object as object raw JSON', () => {
    expect(formatValueForCopy({ a: 1, b: 2 })).toEqual({
      text: '{"a":1,"b":2}',
      kind: 'object',
    });
  });

  it('formats empty object as object', () => {
    expect(formatValueForCopy({})).toEqual({ text: '{}', kind: 'object' });
  });

  it('formats array as object', () => {
    expect(formatValueForCopy([1, 2, 3])).toEqual({ text: '[1,2,3]', kind: 'object' });
  });

  it('formats mixed-key object (one $-key, one normal) as object', () => {
    expect(formatValueForCopy({ $oid: 'x', extra: 1 })).toEqual({
      text: '{"$oid":"x","extra":1}',
      kind: 'object',
    });
  });
});

describe('formatValueForCellCopy', () => {
  it('copies a string unquoted', () => {
    expect(formatValueForCellCopy('hello')).toBe('hello');
  });

  it('copies a string containing quotes verbatim', () => {
    expect(formatValueForCellCopy('say "hi"')).toBe('say "hi"');
  });

  it('copies a number unquoted', () => {
    expect(formatValueForCellCopy(42)).toBe('42');
  });

  it('copies a boolean unquoted', () => {
    expect(formatValueForCellCopy(true)).toBe('true');
  });

  it('copies null as null', () => {
    expect(formatValueForCellCopy(null)).toBe('null');
    expect(formatValueForCellCopy(undefined)).toBe('null');
  });

  it('copies an EJSON wrapper as its displayed value', () => {
    expect(formatValueForCellCopy({ $oid: '507f1f77bcf86cd799439011' })).toBe('507f1f77bcf86cd799439011');
    expect(formatValueForCellCopy({ $date: '2024-01-01T00:00:00Z' })).toBe('2024-01-01T00:00:00Z');
  });

  it('copies a plain object as raw JSON', () => {
    expect(formatValueForCellCopy({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });
});

describe('buildValuesCopyText', () => {
  it('returns empty string for empty array', () => {
    expect(buildValuesCopyText([])).toBe('');
  });

  it('joins all-primitive values with comma + newline', () => {
    expect(buildValuesCopyText(['a', 'b', 42])).toBe('"a",\n"b",\n42');
  });

  it('joins all-EJSON-scalar values with comma + newline, unwrapped', () => {
    expect(buildValuesCopyText([{ $oid: 'x' }, { $oid: 'y' }])).toBe('"x",\n"y"');
  });

  it('keeps non-scalar EJSON wrappers raw, comma + newline', () => {
    expect(buildValuesCopyText([{ $numberLong: '1' }, { $numberLong: '2' }])).toBe(
      '{"$numberLong":"1"},\n{"$numberLong":"2"}'
    );
  });

  it('joins all-object values with newline only', () => {
    expect(buildValuesCopyText([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}');
  });

  it('joins mixed primitive + object with comma + newline', () => {
    expect(buildValuesCopyText(['x', { a: 1 }])).toBe('"x",\n{"a":1}');
  });

  it('emits null for null/undefined entries', () => {
    expect(buildValuesCopyText([null, 'a', undefined])).toBe('null,\n"a",\nnull');
  });

  it('single primitive has no delimiter', () => {
    expect(buildValuesCopyText(['hello'])).toBe('"hello"');
  });

  it('single object has no delimiter', () => {
    expect(buildValuesCopyText([{ a: 1 }])).toBe('{"a":1}');
  });
});

describe('buildColumnCopyText', () => {
  it('returns empty string for empty docs', () => {
    expect(buildColumnCopyText([], 'a')).toBe('');
  });

  it('emits null for missing keys', () => {
    expect(buildColumnCopyText([{ a: 1 }, { b: 2 }], 'a')).toBe('1,\nnull');
  });

  it('joins primitive column with comma + newline', () => {
    expect(buildColumnCopyText([{ a: 'x' }, { a: 'y' }], 'a')).toBe('"x",\n"y"');
  });

  it('joins all-object column with newline only', () => {
    expect(buildColumnCopyText([{ a: { k: 1 } }, { a: { k: 2 } }], 'a')).toBe('{"k":1}\n{"k":2}');
  });

  it('formats $oid column as quoted inner values, comma + newline', () => {
    expect(buildColumnCopyText([{ a: { $oid: 'abc' } }, { a: { $oid: 'def' } }], 'a')).toBe('"abc",\n"def"');
  });

  it('handles mixed types in same column with comma + newline', () => {
    const docs = [{ a: 'str' }, { a: 42 }, { a: null }, { a: { $oid: 'xyz' } }];
    expect(buildColumnCopyText(docs, 'a')).toBe('"str",\n42,\nnull,\n"xyz"');
  });
});
