import { describe, it, expect } from 'vitest';
import { isEjsonWrapper, formatValueForCopy, buildValuesCopyText, buildColumnCopyText } from './clipboard';

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

  it('formats $oid wrapper as primitive raw EJSON', () => {
    expect(formatValueForCopy({ $oid: '507f1f77bcf86cd799439011' })).toEqual({
      text: '{"$oid":"507f1f77bcf86cd799439011"}',
      kind: 'primitive',
    });
  });

  it('formats $date wrapper as primitive raw EJSON', () => {
    expect(formatValueForCopy({ $date: '2024-01-01T00:00:00Z' })).toEqual({
      text: '{"$date":"2024-01-01T00:00:00Z"}',
      kind: 'primitive',
    });
  });

  it('formats $numberLong wrapper as primitive raw EJSON', () => {
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

describe('buildValuesCopyText', () => {
  it('returns empty string for empty array', () => {
    expect(buildValuesCopyText([])).toBe('');
  });

  it('joins all-primitive values with comma + newline', () => {
    expect(buildValuesCopyText(['a', 'b', 42])).toBe('"a",\n"b",\n42');
  });

  it('joins all-EJSON-wrapper values with comma + newline', () => {
    expect(buildValuesCopyText([{ $oid: 'x' }, { $oid: 'y' }])).toBe('{"$oid":"x"},\n{"$oid":"y"}');
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

  it('formats $oid column as primitive EJSON, comma + newline', () => {
    expect(buildColumnCopyText([{ a: { $oid: 'abc' } }, { a: { $oid: 'def' } }], 'a')).toBe(
      '{"$oid":"abc"},\n{"$oid":"def"}'
    );
  });

  it('handles mixed types in same column with comma + newline', () => {
    const docs = [{ a: 'str' }, { a: 42 }, { a: null }, { a: { $oid: 'xyz' } }];
    expect(buildColumnCopyText(docs, 'a')).toBe('"str",\n42,\nnull,\n{"$oid":"xyz"}');
  });
});
