import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { FindResult } from '../../shared/types';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  filter: z.record(z.string(), z.unknown()).optional(),
  projection: z.record(z.string(), z.unknown()).optional(),
  sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
  skip: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).optional(),
});

export const findCommand: MongoCommand<typeof input, FindResult> = {
  name: 'find',
  input,
  async run(active, { db, collection, filter, projection, sort, skip, limit }) {
    const coll = active.client.db(db).collection(collection);
    const filterDoc = filter ?? {};
    const cursor = coll.find(filterDoc);
    if (projection) cursor.project(projection);
    if (sort) cursor.sort(sort);
    if (skip !== undefined) cursor.skip(skip);
    if (limit !== undefined) cursor.limit(limit);
    const [docs, totalCount] = await Promise.all([cursor.toArray(), coll.countDocuments(filterDoc)]);
    return { docs: docs as Record<string, unknown>[], totalCount };
  },
};
