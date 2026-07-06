import { describe, it, expect } from 'vitest';
import { formatWindowTitle } from './window-title';

describe('formatWindowTitle', () => {
  it('joins name and version with a space', () => {
    expect(formatWindowTitle('MongoBuddy', '1.30.0')).toBe('MongoBuddy 1.30.0');
  });

  it('inserts the location before the name when provided', () => {
    expect(formatWindowTitle('MongoBuddy', '1.30.0', { location: 'mydb.users' })).toBe(
      'mydb.users — MongoBuddy 1.30.0'
    );
  });

  it('omits the location when empty or undefined', () => {
    expect(formatWindowTitle('MongoBuddy', '1.30.0', { location: '' })).toBe('MongoBuddy 1.30.0');
    expect(formatWindowTitle('MongoBuddy', '1.30.0', {})).toBe('MongoBuddy 1.30.0');
    expect(formatWindowTitle('MongoBuddy', '1.30.0', undefined)).toBe('MongoBuddy 1.30.0');
  });
});
