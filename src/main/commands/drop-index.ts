import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  indexName: z.string(),
});

export const dropIndexCommand: MongoCommand<typeof input, undefined> = {
  name: 'dropIndex',
  input,
  async run(active, { db, collection, indexName }) {
    if (indexName === '_id_') throw new Error('Cannot drop the _id_ index');
    await active.client.db(db).collection(collection).dropIndex(indexName);
    return undefined;
  },
};
