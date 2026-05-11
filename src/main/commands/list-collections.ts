import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { ActiveConnection } from '../connection-manager';
import type { CollectionInfo } from '../../shared/types';
import { byNameInsensitive } from '../../shared/sort';

const input = z.object({
  db: z.string(),
});

export async function listCollectionsImpl(active: ActiveConnection, dbName: string): Promise<CollectionInfo[]> {
  const db = active.client.db(dbName);
  const collections = await db.listCollections().toArray();
  const data: CollectionInfo[] = await Promise.all(
    collections.map(async (c) => {
      let count: number | undefined;
      try {
        count = await db.collection(c.name).estimatedDocumentCount();
      } catch {
        // ignore count errors
      }
      return { name: c.name, type: c.type ?? 'collection', count };
    })
  );
  data.sort(byNameInsensitive);
  return data;
}

export const listCollectionsCommand: MongoCommand<typeof input, CollectionInfo[]> = {
  name: 'listCollections',
  input,
  run: (active, { db }) => listCollectionsImpl(active, db),
};
