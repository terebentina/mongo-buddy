import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-store', 'mongodb', 'bson'],
      },
      rollupOptions: {
        external: [
          'kerberos',
          '@aws-sdk/credential-providers',
          '@mongodb-js/zstd',
          'gcp-metadata',
          'mongodb-client-encryption',
          'snappy',
          'socks',
        ],
        output: {
          // Bundled CJS deps (mongodb, bson) emit bare require() calls; the
          // main process is ESM, so define require via createRequire.
          banner:
            "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
});
