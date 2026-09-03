import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const pathOf = value => fileURLToPath(value)
const packageRoot = 'packages/browser-use'
const hostEntries = [
  [`${packageRoot}/browser-use/src/index.ts`, `${packageRoot}/browser-use/lib/index.js`],
  [`${packageRoot}/browser-use-chrome/src/index.ts`, `${packageRoot}/browser-use-chrome/lib/index.js`],
  [`${packageRoot}/browser-use-domain/src/index.ts`, `${packageRoot}/browser-use-domain/lib/index.js`],
  [`${packageRoot}/browser-use-dege/src/index.ts`, `${packageRoot}/browser-use-dege/lib/index.js`],
]

await Promise.all([
  rm(new URL('lib/', root), { recursive: true, force: true }),
  ...hostEntries.map(([, output]) => rm(new URL(output.replace(/index\.js$/, ''), root), { recursive: true, force: true })),
])

await mkdir(new URL('lib/', root), { recursive: true })
await writeFile(new URL('lib/index.js', root), '/** DSH bundle entry; runtime plugins are declared by cordis.patch.yml. */\nexport {}\n')

for (const [entry, output] of hostEntries) {
  await mkdir(new URL(output.replace(/index\.js$/, ''), root), { recursive: true })
  await build({
    entryPoints: [pathOf(new URL(entry, root))],
    outfile: pathOf(new URL(output, root)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    packages: 'external',
  })
}

const domainRoot = `${packageRoot}/browser-use-domain`
const bodyUrl = new URL(`${domainRoot}/lib/client.body.cjs`, root)
await build({
  entryPoints: [pathOf(new URL(`${domainRoot}/src/client/index.tsx`, root))],
  outfile: pathOf(bodyUrl),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-settings/client',
    '@deepseek-ai/dsh-client-ui-renderer/client',
    '@deepseek-ai/dsh-api-remotes/client',
  ],
})
const body = await readFile(bodyUrl, 'utf8')
const indented = body.split('\n').map(line => `    ${line}`).join('\n')
await writeFile(new URL(`${domainRoot}/lib/client.js`, root), `window.__ModuleLoader__.load({
  id: "browser-use-domain",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
${indented}
    return module.exports;
  },
});
`)
await rm(bodyUrl, { force: true })
