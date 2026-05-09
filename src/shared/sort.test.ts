import { describe, it, expect } from 'vitest';
import { byNameInsensitive } from './sort';

describe('byNameInsensitive', () => {
  it('sorts case-insensitively', () => {
    const items = [{ name: 'Z' }, { name: 'a' }, { name: 'B' }];
    expect([...items].sort(byNameInsensitive).map((i) => i.name)).toEqual(['a', 'B', 'Z']);
  });

  it('sorts numeric runs naturally', () => {
    const items = [{ name: 'log10' }, { name: 'log2' }, { name: 'log1' }];
    expect([...items].sort(byNameInsensitive).map((i) => i.name)).toEqual(['log1', 'log2', 'log10']);
  });

  it('combines case-insensitive and numeric ordering', () => {
    const items = [{ name: 'Users_10' }, { name: 'users_2' }, { name: 'USERS_1' }];
    expect([...items].sort(byNameInsensitive).map((i) => i.name)).toEqual(['USERS_1', 'users_2', 'Users_10']);
  });

  it('preserves equal names (stable comparator returns 0)', () => {
    expect(byNameInsensitive({ name: 'foo' }, { name: 'FOO' })).toBe(0);
  });
});
