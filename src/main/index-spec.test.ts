import { describe, it, expect } from 'vitest';
import { sanitizeForExport } from './index-spec';

describe('sanitizeForExport', () => {
  it('drops the _id_ entry', () => {
    const input = [
      { v: 2, key: { _id: 1 }, name: '_id_' },
      { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
    ];
    const out = sanitizeForExport(input);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('email_1');
  });

  it('strips every denylisted field (v, ns, background, textIndexVersion, 2dsphereIndexVersion)', () => {
    const input = [
      {
        v: 2,
        ns: 'mydb.users',
        background: true,
        textIndexVersion: 3,
        '2dsphereIndexVersion': 3,
        key: { email: 1 },
        name: 'email_1',
        unique: true,
      },
    ];
    const out = sanitizeForExport(input);
    expect(out).toHaveLength(1);
    const spec = out[0];
    expect(spec).not.toHaveProperty('v');
    expect(spec).not.toHaveProperty('ns');
    expect(spec).not.toHaveProperty('background');
    expect(spec).not.toHaveProperty('textIndexVersion');
    expect(spec).not.toHaveProperty('2dsphereIndexVersion');
    expect(spec.name).toBe('email_1');
    expect(spec.key).toEqual({ email: 1 });
    expect(spec.unique).toBe(true);
  });

  it('preserves user spec fields (unique, sparse, expireAfterSeconds, partialFilterExpression, collation, weights, default_language, language_override, hidden, wildcardProjection)', () => {
    const input = [
      {
        v: 2,
        key: { a: 1 },
        name: 'kitchen_sink',
        unique: true,
        sparse: true,
        expireAfterSeconds: 3600,
        partialFilterExpression: { archived: false },
        collation: { locale: 'en', strength: 2 },
        weights: { title: 10, body: 1 },
        default_language: 'english',
        language_override: 'lang',
        hidden: true,
        wildcardProjection: { 'a.b': 1 },
      },
    ];
    const out = sanitizeForExport(input);
    expect(out).toHaveLength(1);
    const spec = out[0];
    expect(spec.unique).toBe(true);
    expect(spec.sparse).toBe(true);
    expect(spec.expireAfterSeconds).toBe(3600);
    expect(spec.partialFilterExpression).toEqual({ archived: false });
    expect(spec.collation).toEqual({ locale: 'en', strength: 2 });
    expect(spec.weights).toEqual({ title: 10, body: 1 });
    expect(spec.default_language).toBe('english');
    expect(spec.language_override).toBe('lang');
    expect(spec.hidden).toBe(true);
    expect(spec.wildcardProjection).toEqual({ 'a.b': 1 });
  });

  it('is a no-op (empty array) when there are no user indexes — only _id_', () => {
    const input = [{ v: 2, key: { _id: 1 }, name: '_id_' }];
    const out = sanitizeForExport(input);
    expect(out).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(sanitizeForExport([])).toEqual([]);
  });

  it('does not mutate the input array or its entries', () => {
    const entry = {
      v: 2,
      ns: 'mydb.users',
      background: true,
      key: { email: 1 },
      name: 'email_1',
      unique: true,
    };
    const input = [entry, { v: 2, key: { _id: 1 }, name: '_id_' }];
    const inputSnapshot = JSON.parse(JSON.stringify(input));
    sanitizeForExport(input);
    expect(input).toEqual(inputSnapshot);
    // entry reference still has its original fields
    expect(entry.v).toBe(2);
    expect(entry.ns).toBe('mydb.users');
    expect(entry.background).toBe(true);
  });

  it('returns a fresh array (different reference)', () => {
    const input = [{ v: 2, key: { x: 1 }, name: 'x_1' }];
    const out = sanitizeForExport(input);
    expect(out).not.toBe(input);
  });
});
