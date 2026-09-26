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
  it('is true for $regex with $options (two $-prefixed keys)', () => {
    expect(isEjsonWrapper({ $regex: 'a', $options: 'i' })).toBe(true);
  });
});

describe('formatValueForCopy', () => {
  it('formats string as quoted primitive', () => {
    expect(formatValueForCopy('hello')).toEqual({ text: '"hello"', kind: 'primitive' });
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
  it('copies a string containing quotes verbatim', () => {
    expect(formatValueForCellCopy('say "hi"')).toBe('say "hi"');
  });

  it('copies a number unquoted', () => {
    expect(formatValueForCellCopy(42)).toBe('42');
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
});

describe('buildColumnCopyText', () => {
  it('emits null for missing keys', () => {
    expect(buildColumnCopyText([{ a: 1 }, { b: 2 }], 'a')).toBe('1,\nnull');
  });

  it('reads values from a dotted field path', () => {
    expect(buildColumnCopyText([{ data: { id: 1 } }, { data: { id: 2 } }], 'data.id')).toBe('1,\n2');
  });
});
