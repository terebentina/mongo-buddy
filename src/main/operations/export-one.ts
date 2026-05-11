import { EJSON } from 'bson';
import type { ActiveConnection } from '../connection-manager';
import type { Result } from '../../shared/types';
import type { OperationCtx } from './types';

export interface ExportOneSuccess {
  exported: number;
  sidecarWarning?: string;
}

/**
 * Export one collection's data file AND its indexes sidecar. The pairing is
 * one concept: the data file is the primary artifact, the sidecar is best-effort
 * metadata that, if it fails, downgrades to a warning rather than an error.
 */
export async function exportOneCollection(
  ctx: OperationCtx,
  active: ActiveConnection,
  dbName: string,
  collName: string,
  savePath: string
): Promise<Result<ExportOneSuccess>> {
  const sink = ctx.fs.writeGzipSink(savePath);

  const dataRes = await ctx.mongo.exportCollection(
    active,
    dbName,
    collName,
    sink.writable,
    (count) => ctx.onProgress({ processed: count }),
    ctx.signal
  );

  if (!dataRes.ok) {
    await sink.destroy();
    return { ok: false, error: dataRes.error };
  }

  try {
    await sink.finalize();
  } catch (err) {
    await sink.destroy();
    return { ok: false, error: (err as Error).message };
  }

  const exported = dataRes.data;

  let sidecarWarning: string | undefined;
  try {
    const indexesRes = await ctx.mongo.getExportableIndexes(active, dbName, collName);
    if (!indexesRes.ok) {
      sidecarWarning = `Exported data but failed to read indexes: ${indexesRes.error}`;
    } else {
      const sidecarPath = ctx.fs.indexesSidecarPath(savePath);
      const json = JSON.stringify(EJSON.serialize(indexesRes.data));
      await ctx.fs.writeIndexesSidecar(sidecarPath, json);
    }
  } catch (err) {
    sidecarWarning = `Exported data but failed to write indexes sidecar: ${(err as Error).message}`;
  }

  return { ok: true, data: { exported, sidecarWarning } };
}
