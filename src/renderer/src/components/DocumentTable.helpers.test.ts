import { describe, it, expect } from 'vitest';
import { formatCell, buildColumnCopyText, buildValuesCopyText } from './DocumentTable.helpers';

describe('formatCell', () => {
  it('returns empty string for null', () => {
    expect(formatCell(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatCell(undefined)).toBe('');
  });

  it('stringifies primitives', () => {
    expect(formatCell('hello')).toBe('hello');
    expect(formatCell(42)).toBe('42');
    expect(formatCell(true)).toBe('true');
  });

  it('unwraps $date objects', () => {
    expect(formatCell({ $date: '2026-01-01T00:00:00Z' })).toBe('2026-01-01T00:00:00Z');
  });

  it('unwraps $oid objects', () => {
    expect(formatCell({ $oid: '507f1f77bcf86cd799439011' })).toBe('507f1f77bcf86cd799439011');
  });

  it('JSON-stringifies plain objects', () => {
    expect(formatCell({ k: 1 })).toBe('{"k":1}');
  });
});

describe('buildColumnCopyText', () => {
  it('returns empty string for empty docs', () => {
    expect(buildColumnCopyText([], 'a')).toBe('');
  });

  it('joins primitive values with newlines', () => {
    expect(buildColumnCopyText([{ a: 'x' }, { a: 'y' }], 'a')).toBe('x\ny');
  });

  it('preserves row count with empty lines for missing keys', () => {
    expect(buildColumnCopyText([{ a: 1 }, { b: 2 }], 'a')).toBe('1\n');
  });

  it('preserves row count with empty lines for null/undefined', () => {
    expect(buildColumnCopyText([{ a: null }, { a: undefined }], 'a')).toBe('\n');
  });

  it('serializes objects via formatCell', () => {
    expect(buildColumnCopyText([{ a: { k: 1 } }], 'a')).toBe('{"k":1}');
  });

  it('unwraps $oid and $date in column values', () => {
    const docs = [{ a: { $oid: 'abc' } }, { a: { $date: '2026-05-15' } }];
    expect(buildColumnCopyText(docs, 'a')).toBe('abc\n2026-05-15');
  });

  it('handles mixed types in same column', () => {
    const docs = [{ a: 'str' }, { a: 42 }, { a: null }, { a: { $oid: 'xyz' } }];
    expect(buildColumnCopyText(docs, 'a')).toBe('str\n42\n\nxyz');
  });
});

describe('buildValuesCopyText', () => {
  it('returns empty string for empty array', () => {
    expect(buildValuesCopyText([])).toBe('');
  });

  it('joins primitive values with newlines', () => {
    expect(buildValuesCopyText(['x', 'y'])).toBe('x\ny');
  });

  it('preserves empty lines for null and undefined', () => {
    expect(buildValuesCopyText([null, undefined])).toBe('\n');
  });

  it('unwraps $oid and $date', () => {
    expect(buildValuesCopyText([{ $oid: 'abc' }, { $date: '2026-05-15' }])).toBe('abc\n2026-05-15');
  });

  it('JSON-stringifies plain objects', () => {
    expect(buildValuesCopyText([{ k: 1 }])).toBe('{"k":1}');
  });

  it('handles mixed types', () => {
    expect(buildValuesCopyText(['str', 42, null, { $oid: 'xyz' }])).toBe('str\n42\n\nxyz');
  });
});
