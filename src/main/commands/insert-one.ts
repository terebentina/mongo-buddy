import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  doc: z.record(z.string(), z.unknown()),
});

export const insertOneCommand: MongoCommand<typeof input, Record<string, unknown> | null> = {
  name: 'insertOne',
  input,
  async run(active, { db, collection, doc }) {
    const coll = active.client.db(db).collection(collection);
    const result = await coll.insertOne(doc);
    const inserted = await coll.findOne({ _id: result.insertedId });
    return inserted as Record<string, unknown> | null;
  },
};
