import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  from: z.string(),
  to: z.string(),
});

export const renameCollectionCommand: MongoCommand<typeof input, undefined> = {
  name: 'renameCollection',
  input,
  async run(active, { db, from, to }) {
    await active.client.db(db).renameCollection(from, to);
    return undefined;
  },
};
