import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['src/renderer/src/test-setup.ts']
  }
})
