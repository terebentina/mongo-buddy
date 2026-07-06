import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
});

export const emptyCollectionCommand: MongoCommand<typeof input, number> = {
  name: 'emptyCollection',
  input,
  async run(active, { db, collection }) {
    const { deletedCount } = await active.client.db(db).collection(collection).deleteMany({});
    return deletedCount;
  },
};
