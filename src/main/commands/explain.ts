import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.discriminatedUnion('queryMode', [
  z.object({
    queryMode: z.literal('filter'),
    db: z.string(),
    collection: z.string(),
    query: z.record(z.string(), z.unknown()),
  }),
  z.object({
    queryMode: z.literal('aggregate'),
    db: z.string(),
    collection: z.string(),
    query: z.array(z.record(z.string(), z.unknown())),
  }),
]);

export const explainCommand: MongoCommand<typeof input, Record<string, unknown>> = {
  name: 'explain',
  input,
  async run(active, parsed) {
    const coll = active.client.db(parsed.db).collection(parsed.collection);
    const plan =
      parsed.queryMode === 'aggregate'
        ? await coll.aggregate(parsed.query).explain('executionStats')
        : await coll.find(parsed.query).explain('executionStats');
    return plan as Record<string, unknown>;
  },
};
