import { describe, it, expect } from 'vitest';
import { getConnectionDisplayName } from './connection-name';

describe('getConnectionDisplayName', () => {
  const saved = [
    { name: 'Local Dev', uri: 'mongodb://localhost:27017' },
    { name: 'Production', uri: 'mongodb+srv://cluster0.abc.mongodb.net' },
  ];

  it('returns saved connection name when URI matches', () => {
    expect(getConnectionDisplayName('mongodb://localhost:27017', saved)).toBe('Local Dev');
  });

  it('returns saved connection name for SRV match', () => {
    expect(getConnectionDisplayName('mongodb+srv://cluster0.abc.mongodb.net', saved)).toBe('Production');
  });

  it('returns hostname when no saved connection matches', () => {
    expect(getConnectionDisplayName('mongodb://192.168.1.100:27017', saved)).toBe('192.168.1.100');
  });

  it('returns hostname for SRV URI with no match', () => {
    expect(getConnectionDisplayName('mongodb+srv://other.cluster.net', saved)).toBe('other.cluster.net');
  });

  it('strips credentials from URI before extracting hostname', () => {
    expect(getConnectionDisplayName('mongodb://admin:secret@myhost.example.com:27017', [])).toBe('myhost.example.com');
  });

  it('returns "Databases" for empty URI', () => {
    expect(getConnectionDisplayName('', saved)).toBe('Databases');
  });

  it('returns "Databases" for empty saved connections and empty URI', () => {
    expect(getConnectionDisplayName('', [])).toBe('Databases');
  });
});
