import { z } from 'zod';
import type { UpdateOptions } from 'mongodb';
import type { UpdateManyResult } from '../../shared/types';
import type { MongoCommand } from './dispatch';

const updateDocument = z.record(z.string(), z.unknown());

const input = z.object({
  db: z.string(),
  collection: z.string(),
  filter: z.record(z.string(), z.unknown()),
  update: z.union([updateDocument, z.array(updateDocument)]),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const updateManyCommand: MongoCommand<typeof input, UpdateManyResult> = {
  name: 'updateMany',
  input,
  async run(active, { db, collection, filter, update, options }) {
    const target = active.client.db(db).collection(collection);
    const { matchedCount, modifiedCount } = await target.updateMany(
      filter,
      update,
      options as UpdateOptions | undefined
    );
    return { matchedCount, modifiedCount };
  },
};
