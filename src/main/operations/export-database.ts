import { z } from 'zod';
import { exportOneCollection } from './export-one';
import type { OperationDef } from './types';

export const exportDatabaseOp: OperationDef<'export-database'> = {
  kind: 'export-database',
  params: z.object({
    kind: z.literal('export-database'),
    db: z.string(),
    collections: z.array(z.string()).optional(),
  }),
  async run(active, params, ctx) {
    const folder = await ctx.dialog.pickFolder();
    if (folder === null) {
      return {
        ok: true,
        data: { data: { kind: 'export-database', exported: 0, folder: null } },
      };
    }

    const listRes = await ctx.mongo.listCollections(active, params.db);
    if (!listRes.ok) {
      return { ok: false, error: listRes.error };
    }

    let collections = listRes.data.filter((c) => c.type === 'collection');
    if (params.collections !== undefined) {
      const wanted = new Set(params.collections);
      collections = collections.filter((c) => wanted.has(c.name));
    }
    const total = collections.length;
    ctx.onProgress({ processed: 0, total });

    let totalExported = 0;
    const sidecarErrorCollections: string[] = [];

    for (let i = 0; i < collections.length; i++) {
      if (ctx.signal.aborted) break;
      const coll = collections[i];
      const filePath = ctx.fs.joinExportFilename(folder, coll.name);

      ctx.onProgress({
        processed: totalExported,
        total,
        label: coll.name,
        stage: `${i + 1} of ${total}`,
      });

      // Wrap ctx.onProgress so per-collection counts add to the running total.
      const loopCtx = {
        ...ctx,
        onProgress: (patch: Parameters<typeof ctx.onProgress>[0]): void => {
          if (typeof patch.processed === 'number') {
            ctx.onProgress({
              processed: totalExported + patch.processed,
              total,
              label: coll.name,
              stage: `${i + 1} of ${total}`,
            });
          } else {
            ctx.onProgress(patch);
          }
        },
      };

      const oneRes = await exportOneCollection(loopCtx, active, params.db, coll.name, filePath);
      if (!oneRes.ok) {
        return { ok: false, error: oneRes.error };
      }
      totalExported += oneRes.data.exported;
      if (oneRes.data.sidecarWarning !== undefined) {
        sidecarErrorCollections.push(coll.name);
      }
    }

    const warning =
      sidecarErrorCollections.length > 0 ? `sidecar errors for: ${sidecarErrorCollections.join(', ')}` : undefined;

    return {
      ok: true,
      data: {
        data: { kind: 'export-database', exported: totalExported, folder },
        warning,
      },
    };
  },
};
