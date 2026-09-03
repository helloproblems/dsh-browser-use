import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const pathOf = value => fileURLToPath(value)
const hostEntries = [
  ['src/index.ts', 'lib/index.js'],
  ['packages/browser-use-chrome/src/index.ts', 'packages/browser-use-chrome/lib/index.js'],
  ['packages/browser-use-domain/src/index.ts', 'packages/browser-use-domain/lib/index.js'],
  ['packages/browser-use-dege/src/index.ts', 'packages/browser-use-dege/lib/index.js'],
]

await Promise.all([
  rm(new URL('lib/', root), { recursive: true, force: true }),
  ...hostEntries.slice(1).map(([, output]) => rm(new URL(output.replace(/index\.js$/, ''), root), { recursive: true, force: true })),
])

for (const [entry, output] of hostEntries) {
  await mkdir(new URL(output.replace(/index\.js$/, ''), root), { recursive: true })
  await build({ entryPoints: [pathOf(new URL(entry, root))], outfile: pathOf(new URL(output, root)), bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, packages: 'external' })
}

const bodyUrl = new URL('packages/browser-use-domain/lib/client.body.cjs', root)
await build({
  entryPoints: [pathOf(new URL('packages/browser-use-domain/src/client/index.tsx', root))],
  outfile: pathOf(bodyUrl), bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-settings/client', '@deepseek-ai/dsh-client-ui-renderer/client', '@deepseek-ai/dsh-api-remotes/client'],
})
const body = await readFile(bodyUrl, 'utf8')
const indented = body.split('\n').map(line => `    ${line}`).join('\n')
await writeFile(new URL('packages/browser-use-domain/lib/client.js', root), `window.__ModuleLoader__.load({\n  id: "browser-use-domain",\n  factory: (require) => {\n    const module = { exports: {} };\n    const exports = module.exports;\n${indented}\n    return module.exports;\n  },\n});\n`)
await rm(bodyUrl, { force: true })

