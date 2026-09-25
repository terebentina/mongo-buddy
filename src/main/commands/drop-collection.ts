import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
});

export const dropCollectionCommand: MongoCommand<typeof input, undefined> = {
  name: 'dropCollection',
  input,
  async run(active, { db, collection }) {
    if (!(await active.client.db(db).dropCollection(collection))) throw new Error('Collection was not dropped');
    return undefined;
  },
};
