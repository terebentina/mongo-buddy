import { z } from 'zod';
import { exportOneCollection } from './export-one';
import type { OperationDef } from './types';

export const exportCollectionOp: OperationDef<'export-collection'> = {
  kind: 'export-collection',
  params: z.object({
    kind: z.literal('export-collection'),
    db: z.string(),
    collection: z.string(),
  }),
  async run(active, params, ctx) {
    if (ctx.signal.aborted) return { ok: false, error: 'Export cancelled' };
    const savePath = await ctx.dialog.pickSaveFile(params.collection);
    if (ctx.signal.aborted) return { ok: false, error: 'Export cancelled' };
    if (savePath === null) {
      return {
        ok: true,
        data: { data: { kind: 'export-collection', exported: 0, path: null } },
      };
    }

    const oneRes = await exportOneCollection(ctx, active, params.db, params.collection, savePath);
    if (!oneRes.ok) {
      return { ok: false, error: oneRes.error };
    }

    return {
      ok: true,
      data: {
        data: { kind: 'export-collection', exported: oneRes.data.exported, path: savePath },
        warning: oneRes.data.sidecarWarning,
      },
    };
  },
};
