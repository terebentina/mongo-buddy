import { describe, it, expect } from 'vitest';
import { validateDbName } from './validate-db-name';

describe('validateDbName', () => {
  it('accepts a simple name', () => {
    expect(validateDbName('myapp', [])).toEqual({ ok: true });
  });

  it('accepts names with underscores, dashes, digits', () => {
    expect(validateDbName('my_app-2', [])).toEqual({ ok: true });
  });

  it('rejects empty string', () => {
    const r = validateDbName('', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it('rejects whitespace-only', () => {
    const r = validateDbName('   ', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateDbName('  myapp  ', [])).toEqual({ ok: true });
  });

  it('rejects duplicate (existing db)', () => {
    const r = validateDbName('myapp', ['admin', 'myapp']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists/i);
  });

  it('rejects duplicate after trimming', () => {
    const r = validateDbName('  myapp ', ['myapp']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists/i);
  });

  it.each(['admin', 'local', 'config'])('rejects reserved name "%s"', (name) => {
    const r = validateDbName(name, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reserved/i);
  });

  it.each([['/'], ['\\'], ['.'], ['"'], ['$'], ['*'], ['<'], ['>'], [':'], ['|'], ['?'], [' '], ['\0']])(
    'rejects name containing forbidden char %j',
    (ch) => {
      const r = validateDbName(`my${ch}db`, []);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/cannot contain/i);
    }
  );

  it('rejects names longer than 63 bytes', () => {
    const r = validateDbName('a'.repeat(64), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/63 bytes/i);
  });

  it('accepts names exactly 63 bytes', () => {
    expect(validateDbName('a'.repeat(63), [])).toEqual({ ok: true });
  });

  it('counts bytes, not characters, against the 63-byte limit', () => {
    const r = validateDbName('é'.repeat(32), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/63 bytes/i);
  });
});
