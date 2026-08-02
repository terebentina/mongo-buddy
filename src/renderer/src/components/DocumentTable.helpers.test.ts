import { describe, it, expect } from 'vitest';
import { formatCell, isScalarCell, unwrapEjsonScalar } from './DocumentTable.helpers';

describe('unwrapEjsonScalar', () => {
  it('unwraps $date', () => {
    expect(unwrapEjsonScalar({ $date: '2026-01-01T00:00:00Z' })).toBe('2026-01-01T00:00:00Z');
  });

  it('unwraps $oid', () => {
    expect(unwrapEjsonScalar({ $oid: '507f1f77bcf86cd799439011' })).toBe('507f1f77bcf86cd799439011');
  });

  it('prefers $date when both keys are present', () => {
    expect(unwrapEjsonScalar({ $oid: 'x', $date: 'd' })).toBe('d');
  });

  it('returns null for wrappers that are not scalars', () => {
    expect(unwrapEjsonScalar({ $numberLong: '1' })).toBeNull();
    expect(unwrapEjsonScalar({ $binary: { base64: '', subType: '00' } })).toBeNull();
  });

  it('returns null for plain and empty objects', () => {
    expect(unwrapEjsonScalar({ k: 1 })).toBeNull();
    expect(unwrapEjsonScalar({})).toBeNull();
  });

  it('returns null for an out-of-range date, which nests $numberLong', () => {
    expect(unwrapEjsonScalar({ $date: { $numberLong: '1000000000000000' } })).toBeNull();
  });
});

describe('isScalarCell', () => {
  it('is true for every primitive, including empty ones', () => {
    expect(isScalarCell('a')).toBe(true);
    expect(isScalarCell(1)).toBe(true);
    expect(isScalarCell(0)).toBe(true);
    expect(isScalarCell(true)).toBe(true);
    expect(isScalarCell(false)).toBe(true);
    expect(isScalarCell(null)).toBe(true);
    expect(isScalarCell(undefined)).toBe(true);
    expect(isScalarCell('')).toBe(true);
  });

  it('is true for EJSON scalars', () => {
    expect(isScalarCell({ $oid: '507f1f77bcf86cd799439011' })).toBe(true);
    expect(isScalarCell({ $date: '2026-01-01T00:00:00Z' })).toBe(true);
  });

  it('is false for wrappers that display as JSON', () => {
    expect(isScalarCell({ $numberLong: '1' })).toBe(false);
    expect(isScalarCell({ $numberDecimal: '1.5' })).toBe(false);
    expect(isScalarCell({ $binary: { base64: '', subType: '00' } })).toBe(false);
    expect(isScalarCell({ $timestamp: { t: 1, i: 2 } })).toBe(false);
    expect(isScalarCell({ $regularExpression: { pattern: 'a', options: 'i' } })).toBe(false);
    expect(isScalarCell({ $date: { $numberLong: '1000000000000000' } })).toBe(false);
  });

  it('is false for objects and arrays', () => {
    expect(isScalarCell({ a: 1 })).toBe(false);
    expect(isScalarCell({})).toBe(false);
    expect(isScalarCell([1, 2])).toBe(false);
    expect(isScalarCell([])).toBe(false);
  });
});

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
