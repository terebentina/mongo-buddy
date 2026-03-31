import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-store', 'mongodb', 'bson']
      },
      rollupOptions: {
        external: [
          'kerberos',
          '@aws-sdk/credential-providers',
          '@mongodb-js/zstd',
          'gcp-metadata',
          'mongodb-client-encryption',
          'snappy',
          'socks'
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
