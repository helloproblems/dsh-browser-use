import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Use the same source aliases as TypeScript, including every backend.
const { compilerOptions: { paths } } = JSON.parse(readFileSync(new URL('./tsconfig.base.json', import.meta.url), 'utf8')) as { compilerOptions: { paths: Record<string, [string]> } }
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(Object.entries(paths).map(([name, [source]]) => [name, fileURLToPath(new URL(source, import.meta.url))])),
  },
})
