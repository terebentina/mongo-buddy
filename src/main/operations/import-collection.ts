import { z } from 'zod';
import { parseAndValidateSidecar, type IndexSpec } from '../index-spec';
import type { OperationDef } from './types';

export const importCollectionOp: OperationDef<'import-collection'> = {
  kind: 'import-collection',
  params: z.object({
    kind: z.literal('import-collection'),
    db: z.string(),
    collection: z.string(),
    filePath: z.string(),
    options: z.object({
      onDuplicate: z.enum(['skip', 'fail', 'upsert']),
      clearFirst: z.boolean(),
    }),
  }),
  async run(active, params, ctx) {
    // Validate sidecar BEFORE any destructive data operation. A bad sidecar
    // must not cause "Clear collection first" to wipe data and then fail.
    let sidecarSpecs: IndexSpec[] | null = null;
    try {
      const sidecarPath = ctx.fs.indexesSidecarPath(params.filePath);
      const raw = await ctx.fs.readIndexesSidecar(sidecarPath);
      if (raw !== null) {
        sidecarSpecs = parseAndValidateSidecar(raw);
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const source = ctx.fs.readGunzipSource(params.filePath);
    const importRes = await ctx.mongo.importCollection(
      active,
      params.db,
      params.collection,
      source.readable,
      params.options,
      (count) => ctx.onProgress({ processed: count }),
      ctx.signal
    );

    await source.destroy();

    if (!importRes.ok) {
      return { ok: false, error: importRes.error };
    }

    const { inserted, skipped } = importRes.data;

    let warning: string | undefined;
    if (sidecarSpecs === null) {
      warning = 'No indexes were restored (sidecar file not found).';
    } else {
      const applyRes = await ctx.mongo.applyImportedIndexes(active, params.db, params.collection, sidecarSpecs, {
        dropExisting: params.options.clearFirst,
      });
      if (!applyRes.ok) {
        return { ok: false, error: `${applyRes.error} (${inserted} docs imported)` };
      }
    }

    return {
      ok: true,
      data: {
        data: { kind: 'import-collection', inserted, skipped },
        warning,
      },
    };
  },
};
