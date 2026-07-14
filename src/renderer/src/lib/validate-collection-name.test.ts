import { describe, it, expect } from 'vitest';
import { validateCollectionName } from './validate-collection-name';

describe('validateCollectionName', () => {
  it('accepts a simple name', () => {
    expect(validateCollectionName('members', 'users', [])).toEqual({ ok: true });
  });

  it('accepts names with underscores, dashes, digits, dots', () => {
    expect(validateCollectionName('my.coll_2-a', 'users', [])).toEqual({ ok: true });
  });

  it('rejects empty string', () => {
    const r = validateCollectionName('', 'users', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it('rejects whitespace-only', () => {
    const r = validateCollectionName('   ', 'users', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/required/i);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateCollectionName('  members  ', 'users', [])).toEqual({ ok: true });
  });

  it('rejects the unchanged name', () => {
    const r = validateCollectionName('users', 'users', ['users']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same name|unchanged|different/i);
  });

  it('rejects the unchanged name after trimming', () => {
    const r = validateCollectionName('  users ', 'users', ['users']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/same name|unchanged|different/i);
  });

  it('rejects a name that already exists', () => {
    const r = validateCollectionName('orders', 'users', ['users', 'orders']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists/i);
  });

  it('rejects a name containing "$"', () => {
    const r = validateCollectionName('a$b', 'users', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot contain/i);
  });

  it('rejects a name containing a null byte', () => {
    const r = validateCollectionName('a\0b', 'users', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot contain/i);
  });

  it('rejects names starting with "system."', () => {
    const r = validateCollectionName('system.users', 'users', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/system\./i);
  });
});
