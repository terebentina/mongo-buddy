import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import type * as FsPromises from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createFsSinkAdapter } from './fs-sink';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

afterEach(() => {
  vi.mocked(writeFile).mockReset();
});

describe('index sidecar cancellation', () => {
  it('removes a truncated sidecar before reporting an interrupted write', async () => {
    const actual = await vi.importActual<typeof FsPromises>('fs/promises');
    const folder = await mkdtemp(path.join(tmpdir(), 'mongo-buddy-sidecar-'));
    try {
      const adapter = createFsSinkAdapter();
      const sidecar = path.join(folder, 'collection.indexes.json');
      const controller = new AbortController();
      const abortError = Object.assign(new Error('Sidecar write interrupted'), {
        name: 'AbortError',
        code: 'ABORT_ERR',
      });
      vi.mocked(writeFile).mockImplementationOnce(async (filePath) => {
        await actual.writeFile(filePath, '[{"name":', 'utf8');
        controller.abort();
        throw abortError;
      });

      await expect(
        adapter.writeIndexesSidecar(sidecar, '[{"name":"n_1","key":{"n":1}}]', controller.signal)
      ).rejects.toBe(abortError);
      expect(await adapter.readIndexesSidecar(sidecar)).toBeNull();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('preserves an existing valid sidecar when cancellation precedes the write', async () => {
    const actual = await vi.importActual<typeof FsPromises>('fs/promises');
    const folder = await mkdtemp(path.join(tmpdir(), 'mongo-buddy-sidecar-'));
    try {
      const adapter = createFsSinkAdapter();
      const sidecar = path.join(folder, 'collection.indexes.json');
      const original = '[{"name":"n_1","key":{"n":1}}]';
      await actual.writeFile(sidecar, original, 'utf8');
      vi.mocked(writeFile).mockImplementation(actual.writeFile);
      const controller = new AbortController();
      const abortError = Object.assign(new Error('Export already cancelled'), {
        name: 'AbortError',
      });
      controller.abort(abortError);

      await expect(adapter.writeIndexesSidecar(sidecar, '[]', controller.signal)).rejects.toBe(abortError);
      expect(await adapter.readIndexesSidecar(sidecar)).toBe(original);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
