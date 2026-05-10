import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

export const countCommand: MongoCommand<typeof input, number> = {
  name: 'count',
  ipcChannel: 'mongo:count',
  mcpToolName: 'count',
  input,
  async run(active, { db, collection, filter }) {
    return active.client
      .db(db)
      .collection(collection)
      .countDocuments(filter ?? {});
  },
};
