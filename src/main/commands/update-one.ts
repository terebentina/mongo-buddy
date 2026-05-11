import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  id: z.unknown().refine((v) => v !== undefined, 'id is required'),
  doc: z.record(z.string(), z.unknown()),
});

export const updateOneCommand: MongoCommand<typeof input, Record<string, unknown> | null> = {
  name: 'updateOne',
  input,
  async run(active, { db, collection, id, doc }) {
    const coll = active.client.db(db).collection(collection);
    // Drop _id from the update body so MongoDB doesn't reject the replacement.
    const { _id, ...updateFields } = doc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idFilter = { _id: id as any };
    await coll.replaceOne(idFilter, updateFields);
    const updated = await coll.findOne(idFilter);
    return updated as Record<string, unknown> | null;
  },
};
