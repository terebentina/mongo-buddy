import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
});

export const createCollectionCommand: MongoCommand<typeof input, undefined> = {
  name: 'createCollection',
  input,
  async run(active, { db, collection }) {
    await active.client.db(db).createCollection(collection);
    return undefined;
  },
};
