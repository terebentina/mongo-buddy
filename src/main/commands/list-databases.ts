import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { DbInfo } from '../../shared/types';
import { byNameInsensitive } from '../../shared/sort';

const input = z.object({});

export const listDatabasesCommand: MongoCommand<typeof input, DbInfo[]> = {
  name: 'listDatabases',
  input,
  async run(active) {
    const result = await active.client.db().admin().listDatabases();
    return result.databases
      .map((db) => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk ?? 0,
        empty: db.empty ?? false,
      }))
      .sort(byNameInsensitive);
  },
};
