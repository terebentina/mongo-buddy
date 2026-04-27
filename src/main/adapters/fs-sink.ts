import { createReadStream, createWriteStream } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { createGunzip, createGzip } from 'zlib';
import type { FilesystemSinkPort, GunzipSource, GzipSink } from '../operation-registry';

const DATA_SUFFIX = '.bson.gz';
const SIDECAR_SUFFIX = '.indexes.json';

export function createFsSinkAdapter(): FilesystemSinkPort {
  return {
    writeGzipSink(filePath: string): GzipSink {
      const gzip = createGzip();
      const file = createWriteStream(filePath);
      gzip.pipe(file);

      return {
        writable: gzip,
        async finalize(): Promise<void> {
          await new Promise<void>((resolve, reject) => {
            gzip.end(() => {
              file.on('finish', resolve);
              file.on('error', reject);
            });
          });
        },
        async destroy(): Promise<void> {
          gzip.destroy();
          file.destroy();
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

    async writeIndexesSidecar(filePath: string, json: string): Promise<void> {
      await writeFile(filePath, json, 'utf8');
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
