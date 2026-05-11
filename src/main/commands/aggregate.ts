import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  pipeline: z.array(z.record(z.string(), z.unknown())),
});

export const aggregateCommand: MongoCommand<typeof input, Record<string, unknown>[]> = {
  name: 'aggregate',
  input,
  async run(active, { db, collection, pipeline }) {
    const docs = await active.client.db(db).collection(collection).aggregate(pipeline).toArray();
    return docs as Record<string, unknown>[];
  },
};
