import type { CreateIndexesOptions } from 'mongodb';
import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const indexDirection = z.union([z.number(), z.enum(['2d', '2dsphere', 'text', 'geoHaystack', 'hashed'])]);

const input = z.object({
  db: z.string(),
  collection: z.string(),
  key: z.record(z.string(), indexDirection).refine((value) => Object.keys(value).length > 0, {
    message: 'Add at least one index field',
  }),
  indexName: z.string().trim().min(1).optional(),
  unique: z.boolean(),
});

export const createIndexCommand: MongoCommand<typeof input, string> = {
  name: 'createIndex',
  input,
  async run(active, { db, collection, key, indexName, unique }) {
    const options: CreateIndexesOptions = { unique };
    if (indexName !== undefined) options.name = indexName;
    return active.client.db(db).collection(collection).createIndex(key, options);
  },
};
