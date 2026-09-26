import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { DropCollectionsResult } from '../../shared/types';

const input = z.object({
  db: z.string().min(1),
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
        const didDrop = await database.dropCollection(name);
        if (didDrop) dropped.push(name);
        else failed.push({ name, error: 'Collection was not dropped' });
      } catch (err) {
        failed.push({ name, error: (err as Error).message });
      }
    }
    return { dropped, failed };
  },
};
