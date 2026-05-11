import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { DropCollectionsResult } from '../../shared/types';

const input = z.object({
  db: z.string(),
  names: z.array(z.string()),
});

export const dropCollectionsCommand: MongoCommand<typeof input, DropCollectionsResult> = {
  name: 'dropCollections',
  input,
  async run(active, { db, names }) {
    const database = active.client.db(db);
    const dropped: string[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const name of names) {
      try {
        await database.dropCollection(name);
        dropped.push(name);
      } catch (err) {
        failed.push({ name, error: (err as Error).message });
      }
    }
    return { dropped, failed };
  },
};
