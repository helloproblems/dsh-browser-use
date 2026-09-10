import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Exercise workspace source directly, without requiring generated lib bundles.
export default defineConfig({
  resolve: {
    alias: {
      'browser-use': fileURLToPath(new URL('./packages/browser-use/browser-use/src/index.ts', import.meta.url)),
    },
  },
})
