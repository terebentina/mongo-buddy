import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ActiveConnection } from '../connection-manager';
import { listDatabasesCommand } from './list-databases';

describe('listDatabasesCommand', () => {
  let mockAdmin: { listDatabases: ReturnType<typeof vi.fn> };
  let mockDb: { admin: ReturnType<typeof vi.fn> };
  let mockClient: { db: ReturnType<typeof vi.fn> };
  let active: ActiveConnection;

  beforeEach(() => {
    mockAdmin = { listDatabases: vi.fn() };
    mockDb = { admin: vi.fn().mockReturnValue(mockAdmin) };
    mockClient = { db: vi.fn().mockReturnValue(mockDb) };
    active = { client: mockClient as unknown as MongoClient, key: 'localhost:27017' };
  });

  it('exposes name "listDatabases"', () => {
    expect(listDatabasesCommand.name).toBe('listDatabases');
  });

  it('returns DbInfo[] sorted case-insensitively', async () => {
    mockAdmin.listDatabases.mockResolvedValue({
      databases: [
        { name: 'testdb', sizeOnDisk: 1024, empty: false },
        { name: 'admin', sizeOnDisk: 512, empty: false },
      ],
    });
    const out = await listDatabasesCommand.run(active, {});
    expect(out).toEqual([
      { name: 'admin', sizeOnDisk: 512, empty: false },
      { name: 'testdb', sizeOnDisk: 1024, empty: false },
    ]);
  });

  it('sorts case-insensitively with numeric ordering', async () => {
    mockAdmin.listDatabases.mockResolvedValue({
      databases: [
        { name: 'log10', sizeOnDisk: 0, empty: false },
        { name: 'Users_2', sizeOnDisk: 0, empty: false },
        { name: 'log2', sizeOnDisk: 0, empty: false },
        { name: 'users_10', sizeOnDisk: 0, empty: false },
      ],
    });
    const out = await listDatabasesCommand.run(active, {});
    expect(out.map((d) => d.name)).toEqual(['log2', 'log10', 'Users_2', 'users_10']);
  });

  it('defaults sizeOnDisk to 0 and empty to false when missing', async () => {
    mockAdmin.listDatabases.mockResolvedValue({
      databases: [{ name: 'x' }],
    });
    const out = await listDatabasesCommand.run(active, {});
    expect(out).toEqual([{ name: 'x', sizeOnDisk: 0, empty: false }]);
  });

  it('input schema accepts empty object', () => {
    expect(listDatabasesCommand.input.safeParse({}).success).toBe(true);
  });
});
