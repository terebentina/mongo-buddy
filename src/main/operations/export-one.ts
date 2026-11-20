import { EJSON } from 'bson';
import type { ActiveConnection } from '../connection-manager';
import type { Result } from '../../shared/types';
import type { OperationCtx } from './types';

export interface ExportOneSuccess {
  exported: number;
  sidecarWarning?: string;
}

/**
 * Export one collection's data file AND its indexes sidecar. Non-cancellation
 * sidecar failures become warnings, but cancellation stops the whole export.
 */
export async function exportOneCollection(
  ctx: OperationCtx,
  active: ActiveConnection,
  dbName: string,
  collName: string,
  savePath: string
): Promise<Result<ExportOneSuccess>> {
  if (ctx.signal.aborted) return { ok: false, error: 'Export cancelled' };
  const sink = ctx.fs.writeGzipSink(savePath, ctx.signal);
  let exported: number;
  try {
    const dataRes = await ctx.mongo.exportCollection(
      active,
      dbName,
      collName,
      sink.writable,
      (count) => ctx.onProgress({ processed: count }),
      ctx.signal
    );
    if (!dataRes.ok) throw new Error(dataRes.error);
    ctx.signal.throwIfAborted();
    await sink.finalize();
    ctx.signal.throwIfAborted();
    exported = dataRes.data;
  } catch (err) {
    await sink.destroy();
    return { ok: false, error: ctx.signal.aborted ? 'Export cancelled' : (err as Error).message };
  }

  let sidecarWarning: string | undefined;
  try {
    const indexesRes = await ctx.mongo.getExportableIndexes(active, dbName, collName, ctx.signal);
    ctx.signal.throwIfAborted();
    if (!indexesRes.ok) {
      sidecarWarning = `Exported data but failed to read indexes: ${indexesRes.error}`;
    } else {
      const sidecarPath = ctx.fs.indexesSidecarPath(savePath);
      const json = JSON.stringify(EJSON.serialize(indexesRes.data));
      await ctx.fs.writeIndexesSidecar(sidecarPath, json, ctx.signal);
      ctx.signal.throwIfAborted();
    }
  } catch (err) {
    if (ctx.signal.aborted) return { ok: false, error: 'Export cancelled' };
    sidecarWarning = `Exported data but failed to write indexes sidecar: ${(err as Error).message}`;
  }

  return { ok: true, data: { exported, sidecarWarning } };
}
