import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  id: z.unknown().refine((v) => v !== undefined, 'id is required'),
});

export const deleteOneCommand: MongoCommand<typeof input, undefined> = {
  name: 'deleteOne',
  input,
  async run(active, { db, collection, id }) {
    await active.client
      .db(db)
      .collection(collection)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .deleteOne({ _id: id as any });
    return undefined;
  },
};
