import { describe, it, expect } from 'vitest';
import { formatWindowTitle } from './window-title';

describe('formatWindowTitle', () => {
  it('joins name and version with a space', () => {
    expect(formatWindowTitle('MongoBuddy', '1.30.0')).toBe('MongoBuddy 1.30.0');
  });
});
