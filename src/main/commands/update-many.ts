import { z } from 'zod';
import type { UpdateManyResult } from '../../shared/types';
import type { MongoCommand } from './dispatch';

const updateDocument = z.record(z.string(), z.unknown());

const input = z.object({
  db: z.string(),
  collection: z.string(),
  filter: z.record(z.string(), z.unknown()),
  update: z.union([updateDocument, z.array(updateDocument)]),
});

export const updateManyCommand: MongoCommand<typeof input, UpdateManyResult> = {
  name: 'updateMany',
  input,
  async run(active, { db, collection, filter, update }) {
    const { matchedCount, modifiedCount } = await active.client
      .db(db)
      .collection(collection)
      .updateMany(filter, update);
    return { matchedCount, modifiedCount };
  },
};
