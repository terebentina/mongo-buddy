import { createReadStream, createWriteStream, type WriteStream } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { createGunzip, createGzip } from 'zlib';
import { finished } from 'stream/promises';
import type { FilesystemSinkPort, GunzipSource, GzipSink } from '../operation-registry';

const DATA_SUFFIX = '.bson.gz';
const SIDECAR_SUFFIX = '.indexes.json';

export function createFsSinkAdapter(): FilesystemSinkPort {
  return {
    writeGzipSink(filePath: string, signal?: AbortSignal): GzipSink {
      const gzip = createGzip();
      let file: WriteStream;
      try {
        file = createWriteStream(filePath);
      } catch (err) {
        gzip.destroy();
        throw err;
      }
      let failure: Error | undefined;
      const fail = (error: Error): void => {
        failure ??= error;
        gzip.destroy(error);
        file.destroy(error);
      };
      const abort = (): void => {
        fail(new Error('Export cancelled'));
      };
      // Observe both streams before piping: open/write/compression failures can
      // happen before the producer reaches finalize().
      const completion = Promise.all([
        finished(gzip, { cleanup: true }).catch(fail),
        finished(file, { cleanup: true }).catch(fail),
      ]).then(() => {
        signal?.removeEventListener('abort', abort);
      });
      gzip.pipe(file);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();

      return {
        writable: gzip,
        async finalize(): Promise<void> {
          signal?.throwIfAborted();
          if (!gzip.writableEnded && !gzip.destroyed) gzip.end();
          await completion;
          if (failure) throw failure;
          signal?.throwIfAborted();
        },
        async destroy(): Promise<void> {
          gzip.destroy();
          file.destroy();
          await completion;
          await unlink(filePath).catch(() => {});
        },
      };
    },

    readGunzipSource(filePath: string): GunzipSource {
      const file = createReadStream(filePath);
      const gunzip = createGunzip();
      const readable = file.pipe(gunzip);

      return {
        readable,
        async destroy(): Promise<void> {
          file.destroy();
          gunzip.destroy();
        },
      };
    },

    joinExportFilename(dir: string, base: string): string {
      return path.join(dir, `${base}${DATA_SUFFIX}`);
    },

    indexesSidecarPath(dataFilePath: string): string {
      if (!dataFilePath.endsWith(DATA_SUFFIX)) {
        throw new Error(`Expected path ending in ${DATA_SUFFIX}, got: ${dataFilePath}`);
      }
      return dataFilePath.slice(0, -DATA_SUFFIX.length) + SIDECAR_SUFFIX;
    },

    async writeIndexesSidecar(filePath: string, json: string, signal?: AbortSignal): Promise<void> {
      signal?.throwIfAborted();
      try {
        await writeFile(filePath, json, { encoding: 'utf8', signal });
      } catch (err) {
        // An aborted write may have created or truncated the sidecar. Wait for
        // the write to settle before removing metadata that would block import.
        if (signal?.aborted) await unlink(filePath).catch(() => {});
        throw err;
      }
    },

    async readIndexesSidecar(filePath: string): Promise<string | null> {
      try {
        return await readFile(filePath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
