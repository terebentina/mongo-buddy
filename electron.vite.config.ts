import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', 'mongodb', 'bson'] })],
    build: {
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
    plugins: [externalizeDepsPlugin()],
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
