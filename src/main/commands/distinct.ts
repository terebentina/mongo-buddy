import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { DistinctResult } from '../../shared/types';

const MAX_VALUES = 1000;

const input = z.object({
  db: z.string(),
  collection: z.string(),
  field: z.string(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

export const distinctCommand: MongoCommand<typeof input, DistinctResult> = {
  name: 'distinct',
  input,
  async run(active, { db, collection, field, filter }) {
    const raw = await active.client
      .db(db)
      .collection(collection)
      .distinct(field, filter ?? {});
    const truncated = raw.length > MAX_VALUES;
    const values = truncated ? raw.slice(0, MAX_VALUES) : raw;
    return { values, truncated };
  },
};
