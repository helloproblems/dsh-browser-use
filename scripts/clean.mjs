import { rm } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
await Promise.all([
  rm(new URL('lib/', root), { recursive: true, force: true }),
  rm(new URL('packages/browser-use-chrome/lib/', root), { recursive: true, force: true }),
  rm(new URL('packages/browser-use-domain/lib/', root), { recursive: true, force: true }),
  rm(new URL('packages/browser-use-dege/lib/', root), { recursive: true, force: true }),
])

