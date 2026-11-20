import { z } from 'zod';
import type { MongoCommand } from './dispatch';
import type { ActiveConnection } from '../connection-manager';
import type { CollectionInfo } from '../../shared/types';
import { byNameInsensitive } from '../../shared/sort';

const input = z.object({
  db: z.string(),
});

export async function listCollectionsImpl(
  active: ActiveConnection,
  dbName: string,
  options: { signal?: AbortSignal; includeCounts?: boolean } = {}
): Promise<CollectionInfo[]> {
  options.signal?.throwIfAborted();
  const db = active.client.db(dbName);
  const cursor = db.listCollections({}, { signal: options.signal });
  let collections: { name: string; type?: string }[];
  try {
    collections = await cursor.toArray();
  } finally {
    await cursor.close();
  }
  options.signal?.throwIfAborted();
  const data: CollectionInfo[] = await Promise.all(
    collections.map(async (c) => {
      let count: number | undefined;
      // Export discovery only needs names/types. Unlike collection cursors,
      // estimatedDocumentCount does not support the driver's AbortSignal.
      if (options.includeCounts !== false) {
        try {
          count = await db.collection(c.name).estimatedDocumentCount();
        } catch {
          // ignore count errors
        }
      }
      return { name: c.name, type: c.type ?? 'collection', count };
    })
  );
  options.signal?.throwIfAborted();
  data.sort(byNameInsensitive);
  return data;
}

export const listCollectionsCommand: MongoCommand<typeof input, CollectionInfo[]> = {
  name: 'listCollections',
  input,
  run: (active, { db }) => listCollectionsImpl(active, db),
};
