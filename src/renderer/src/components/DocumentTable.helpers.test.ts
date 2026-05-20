import { describe, it, expect } from 'vitest';
import { formatCell } from './DocumentTable.helpers';

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
