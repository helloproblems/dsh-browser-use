import { rm } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const packageRoot = 'packages/browser-use'
await Promise.all([
  rm(new URL('lib/', root), { recursive: true, force: true }),
  rm(new URL(`${packageRoot}/browser-use/lib/`, root), { recursive: true, force: true }),
  rm(new URL(`${packageRoot}/browser-use-chrome/lib/`, root), { recursive: true, force: true }),
  rm(new URL(`${packageRoot}/browser-use-domain/lib/`, root), { recursive: true, force: true }),
  rm(new URL(`${packageRoot}/browser-use-dege/lib/`, root), { recursive: true, force: true }),
])
