import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { createGunzip, createGzip } from 'zlib';
import type { FilesystemSinkPort, GunzipSource, GzipSink } from '../operation-registry';

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
      return path.join(dir, `${base}.bson.gz`);
    },
  };
}
