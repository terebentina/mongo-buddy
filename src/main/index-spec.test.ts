import { describe, it, expect } from 'vitest';
import { EJSON } from 'bson';
import { sanitizeForExport, parseAndValidateSidecar, pickIndexesToCreate } from './index-spec';

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

describe('parseAndValidateSidecar', () => {
  it('round-trips a normal sanitized array of specs', () => {
    const specs = [
      { key: { email: 1 }, name: 'email_1', unique: true },
      { key: { name: 1 }, name: 'name_1', sparse: true },
    ];
    const json = JSON.stringify(EJSON.serialize(specs));
    const result = parseAndValidateSidecar(json);
    expect(result).toEqual(specs);
  });

  it('throws on non-JSON input', () => {
    expect(() => parseAndValidateSidecar('not json {')).toThrow(/JSON|parse/i);
  });

  it("throws on JSON that isn't an array", () => {
    expect(() => parseAndValidateSidecar(JSON.stringify({ key: { x: 1 }, name: 'x_1' }))).toThrow(/array/i);
  });

  it('throws on entries missing name', () => {
    const json = JSON.stringify([{ key: { x: 1 } }]);
    expect(() => parseAndValidateSidecar(json)).toThrow(/name/i);
  });

  it('throws on entries with non-string name', () => {
    const json = JSON.stringify([{ key: { x: 1 }, name: 123 }]);
    expect(() => parseAndValidateSidecar(json)).toThrow(/name/i);
  });

  it('throws on entries missing key', () => {
    const json = JSON.stringify([{ name: 'x_1' }]);
    expect(() => parseAndValidateSidecar(json)).toThrow(/key/i);
  });

  it('throws on entries with non-object key', () => {
    const json = JSON.stringify([{ name: 'x_1', key: 'not-an-object' }]);
    expect(() => parseAndValidateSidecar(json)).toThrow(/key/i);
  });

  it('throws on entries with null key', () => {
    const json = JSON.stringify([{ name: 'x_1', key: null }]);
    expect(() => parseAndValidateSidecar(json)).toThrow(/key/i);
  });

  it('correctly EJSON-deserializes BSON-typed values inside partialFilterExpression', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const specs = [
      {
        key: { createdAt: 1 },
        name: 'recent_only',
        partialFilterExpression: { createdAt: { $gt: date } },
      },
    ];
    const json = JSON.stringify(EJSON.serialize(specs));
    const result = parseAndValidateSidecar(json);
    expect(result).toHaveLength(1);
    const filter = result[0].partialFilterExpression as { createdAt: { $gt: unknown } };
    expect(filter.createdAt.$gt).toBeInstanceOf(Date);
    expect((filter.createdAt.$gt as Date).getTime()).toBe(date.getTime());
  });
});

describe('pickIndexesToCreate', () => {
  const specA = { key: { a: 1 }, name: 'a_1' };
  const specB = { key: { b: 1 }, name: 'b_1' };
  const specC = { key: { c: 1 }, name: 'c_1' };

  it('returns all specs when dropExisting is true', () => {
    const out = pickIndexesToCreate([specA, specB], ['a_1', 'b_1', 'other'], true);
    expect(out).toEqual([specA, specB]);
  });

  it('filters out specs whose name appears in existingIndexNames when dropExisting is false', () => {
    const out = pickIndexesToCreate([specA, specB, specC], ['a_1'], false);
    expect(out).toEqual([specB, specC]);
  });

  it('returns empty array when every spec name is already present', () => {
    const out = pickIndexesToCreate([specA, specB], ['a_1', 'b_1', '_id_'], false);
    expect(out).toEqual([]);
  });

  it('returns all specs when existingIndexNames is empty (dropExisting=false)', () => {
    const out = pickIndexesToCreate([specA, specB], [], false);
    expect(out).toEqual([specA, specB]);
  });

  it('uses case-sensitive name comparison', () => {
    const out = pickIndexesToCreate([specA], ['A_1'], false);
    expect(out).toEqual([specA]);
  });

  it('does not mutate inputs', () => {
    const specs = [specA, specB];
    const existing = ['a_1'];
    const specsSnap = JSON.parse(JSON.stringify(specs));
    const existingSnap = [...existing];
    pickIndexesToCreate(specs, existing, false);
    expect(specs).toEqual(specsSnap);
    expect(existing).toEqual(existingSnap);
  });

  it('returns a fresh array (different reference) even when dropExisting is true', () => {
    const specs = [specA, specB];
    const out = pickIndexesToCreate(specs, [], true);
    expect(out).not.toBe(specs);
    expect(out).toEqual(specs);
  });
});
