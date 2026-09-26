import { describe, it, expect } from 'vitest';
import {
  canEditProjectedDocument,
  formatCell,
  getDocumentFieldValue,
  isScalarCell,
  unwrapEjsonScalar,
} from './DocumentTable.helpers';

describe('unwrapEjsonScalar', () => {
  it('unwraps $date', () => {
    expect(unwrapEjsonScalar({ $date: '2026-01-01T00:00:00Z' })).toBe('2026-01-01T00:00:00Z');
  });

  it('unwraps $oid', () => {
    expect(unwrapEjsonScalar({ $oid: '507f1f77bcf86cd799439011' })).toBe('507f1f77bcf86cd799439011');
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

describe('canEditProjectedDocument', () => {
  it.each([
    ['no projection', null, true],
    ['empty projection', {}, true],
    ['implicit _id', { name: 1 }, true],
    ['numeric _id inclusion', { _id: 1 }, true],
    ['numeric _id exclusion', { _id: 0 }, false],
    ['boolean _id inclusion', { _id: true }, false],
    ['computed _id', { _id: '$otherId' }, false],
    ['null _id', { _id: null }, false],
  ])('%s returns %s', (_name, projection, expected) => {
    expect(canEditProjectedDocument(projection)).toBe(expected);
  });
});

describe('getDocumentFieldValue', () => {
  it('reads top-level and nested fields', () => {
    const doc = { status: 'active', data: { id: 42, name: 'some name' } };

    expect(getDocumentFieldValue(doc, 'status')).toBe('active');
    expect(getDocumentFieldValue(doc, 'data.id')).toBe(42);
    expect(getDocumentFieldValue(doc, 'data.name')).toBe('some name');
    expect(getDocumentFieldValue(doc, 'data.missing')).toBeUndefined();
  });

  it('prefers an exact dotted key over traversing a nested document', () => {
    expect(getDocumentFieldValue({ 'data.id': 7, data: { id: 42 } }, 'data.id')).toBe(7);
  });
});

describe('isScalarCell', () => {
  it('is false for wrappers that display as JSON', () => {
    expect(isScalarCell({ $numberLong: '1' })).toBe(false);
    expect(isScalarCell({ $numberDecimal: '1.5' })).toBe(false);
    expect(isScalarCell({ $binary: { base64: '', subType: '00' } })).toBe(false);
    expect(isScalarCell({ $timestamp: { t: 1, i: 2 } })).toBe(false);
    expect(isScalarCell({ $regularExpression: { pattern: 'a', options: 'i' } })).toBe(false);
    expect(isScalarCell({ $date: { $numberLong: '1000000000000000' } })).toBe(false);
  });
});

describe('formatCell', () => {
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
