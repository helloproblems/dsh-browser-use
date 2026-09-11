import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, context } from 'esbuild'

const root = new URL('../', import.meta.url)
const pathOf = value => fileURLToPath(value)
const watch = process.argv.includes('--watch')
const packageRoot = 'packages/browser-use'
const hostEntries = [
  [`${packageRoot}/browser-use/lib/types/index.js`, `${packageRoot}/browser-use/lib/index.js`],
  [`${packageRoot}/browser-use-chrome/lib/types/index.js`, `${packageRoot}/browser-use-chrome/lib/index.js`],
  [`${packageRoot}/browser-use-domain/lib/types/index.js`, `${packageRoot}/browser-use-domain/lib/index.js`],
  [`${packageRoot}/browser-use-edge/lib/types/index.js`, `${packageRoot}/browser-use-edge/lib/index.js`],
]

await Promise.all([
  rm(new URL('lib/', root), { recursive: true, force: true }),
  ...hostEntries.map(([, output]) => rm(new URL(output.replace(/index\.js$/, ''), root), { recursive: true, force: true })),
])

const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
const compiled = spawnSync(process.execPath, [compiler, '-b', 'tsconfig.host.json', 'tsconfig.client.json'], { cwd: pathOf(root), stdio: 'inherit' })
if (compiled.error) throw compiled.error
if (compiled.status !== 0) throw new Error(`TypeScript compilation failed with exit code ${compiled.status}`)

await mkdir(new URL('lib/', root), { recursive: true })
await writeFile(new URL('lib/index.js', root), '/** DSH bundle entry; runtime plugins are declared by cordis.patch.yml. */\nexport {}\n')

// Stage outside the HMR roots, on the same filesystem as the output. Do not
// touch unchanged files, including the initial rebuild performed by watch().
async function publish(path, contents) {
  const bytes = Buffer.from(contents)
  try {
    if ((await readFile(path)).equals(bytes)) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const staging = new URL('.cache/build/', root)
  await mkdir(staging, { recursive: true })
  const temporary = await mkdtemp(pathOf(new URL('output-', staging)))
  try {
    await mkdir(dirname(path), { recursive: true })
    const staged = join(temporary, 'output')
    await writeFile(staged, bytes)
    await rename(staged, path)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function publisher(transform = file => file.contents) {
  return {
    name: 'publish-runtime',
    setup(build) {
      build.onEnd(async result => {
        if (result.errors.length) return
        // Publish maps before their corresponding runtime entry.
        const files = [...result.outputFiles].sort((a, b) => Number(b.path.endsWith('.map')) - Number(a.path.endsWith('.map')))
        for (const file of files) await publish(file.path, transform(file))
      })
    },
  }
}

const builds = []
for (const [entry, output] of hostEntries) {
  await mkdir(new URL(output.replace(/index\.js$/, ''), root), { recursive: true })
  builds.push({
    entryPoints: [pathOf(new URL(entry, root))],
    outfile: pathOf(new URL(output, root)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    packages: 'external',
    write: false,
    plugins: [publisher()],
  })
}

const domainRoot = `${packageRoot}/browser-use-domain`
builds.push({
  entryPoints: [pathOf(new URL(`${domainRoot}/lib/types/client/index.js`, root))],
  outfile: pathOf(new URL(`${domainRoot}/lib/client.js`, root)),
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
  write: false,
  plugins: [publisher(file => {
    const indented = file.text.split('\n').map(line => `    ${line}`).join('\n')
    return `window.__ModuleLoader__.load({
  id: "browser-use-domain",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
${indented}
    return module.exports;
  },
});
`
  })],
})

if (!watch) {
  for (const options of builds) await build(options)
} else {
  const contexts = []
  let compilerWatch
  let stopping
  const stop = (code = 0) => {
    stopping ??= (async () => {
      process.exitCode = code
      if (compilerWatch && compilerWatch.exitCode === null) {
        const exited = new Promise(resolve => compilerWatch.once('close', resolve))
        compilerWatch.kill()
        await exited
      }
      await Promise.all(contexts.map(value => value.dispose()))
    })()
    return stopping
  }
  const onInterrupt = () => { void stop(130) }
  const onTerminate = () => { void stop(143) }
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    for (const options of builds) {
      if (stopping) break
      const instance = await context(options)
      contexts.push(instance)
      await instance.rebuild()
      await instance.watch()
    }
    if (stopping) {
      await stopping
      await Promise.all(contexts.map(value => value.dispose()))
    } else {
      compilerWatch = spawn(process.execPath, [compiler, '-b', 'tsconfig.host.json', 'tsconfig.client.json', '--watch', '--preserveWatchOutput'], {
        cwd: pathOf(root),
        stdio: 'inherit',
      })
      compilerWatch.on('error', error => {
        console.error(error)
        void stop(1)
      })
      compilerWatch.on('exit', (code, signal) => {
        if (stopping) return
        console.error(`TypeScript watcher stopped (${signal ?? code}).`)
        void stop(code || 1)
      })
      console.log('[build] Watching TypeScript and Host/Client bundles. Press Ctrl+C to stop.')
    }
  } catch (error) {
    console.error(error)
    await stop(1)
  }
}
