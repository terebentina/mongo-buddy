import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  filter: z.record(z.string(), z.unknown()),
});

export const deleteManyCommand: MongoCommand<typeof input, number> = {
  name: 'deleteMany',
  input,
  async run(active, { db, collection, filter }) {
    const { deletedCount } = await active.client.db(db).collection(collection).deleteMany(filter);
    return deletedCount;
  },
};
