import { z } from 'zod';
import type { MongoCommand } from './dispatch';

const input = z.object({
  db: z.string(),
  collection: z.string(),
});

export const sampleFieldsCommand: MongoCommand<typeof input, string[]> = {
  name: 'sampleFields',
  input,
  async run(active, { db, collection }) {
    const docs = await active.client.db(db).collection(collection).find({}).limit(50).toArray();
    const keySet = new Set<string>();
    for (const doc of docs) {
      for (const key of Object.keys(doc)) keySet.add(key);
    }
    return Array.from(keySet).sort();
  },
};
