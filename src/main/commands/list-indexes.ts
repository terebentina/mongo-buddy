import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { IndexInfo } from '../../shared/types';

const input = z.object({
  db: z.string(),
  collection: z.string(),
});

export const listIndexesCommand: MongoCommand<typeof input, IndexInfo[]> = {
  name: 'listIndexes',
  input,
  async run(active, { db, collection }) {
    const raw = await active.client.db(db).collection(collection).indexes();
    return raw as unknown as IndexInfo[];
  },
};
