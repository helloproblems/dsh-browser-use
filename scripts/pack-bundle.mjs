import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageRoot = resolve(root, 'packages/browser-use')
const output = resolve(root, '.artifacts/pack')
const stage = resolve(output, '.stage')
const packageDirectories = [
  'browser-use',
  'browser-use-chrome',
  'browser-use-domain',
  'browser-use-edge',
]

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function packageTarballName(manifest) {
  return `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`
}

function rewriteWorkspaceRange(range, version) {
  if (!range.startsWith('workspace:')) return range
  const workspaceRange = range.slice('workspace:'.length)
  if (workspaceRange === '^' || workspaceRange === '~') return `${workspaceRange}${version}`
  if (workspaceRange === '*') return version
  return workspaceRange
}

function publishManifest(manifest, versions) {
  const published = structuredClone(manifest)
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (!published[field]) continue
    for (const [name, range] of Object.entries(published[field])) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        const version = versions.get(name)
        if (!version) throw new Error(`cannot resolve workspace dependency '${name}' for ${manifest.name}`)
        published[field][name] = rewriteWorkspaceRange(range, version)
      }
    }
  }
  delete published.devDependencies
  return published
}

function runPnpm(args, cwd) {
  const pnpmEntry = process.env.npm_execpath
  const command = pnpmEntry ? process.execPath : (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  const commandArgs = pnpmEntry ? [pnpmEntry, ...args] : args
  const result = spawnSync(command, commandArgs, { cwd, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed with exit code ${String(result.status)}`)
}

const rootManifest = await readJson(resolve(root, 'package.json'))
const packages = await Promise.all(packageDirectories.map(async (directory) => {
  const source = resolve(packageRoot, directory)
  const manifest = await readJson(resolve(source, 'package.json'))
  return { source, manifest }
}))
const versions = new Map(packages.map(({ manifest }) => [manifest.name, manifest.version]))

await rm(output, { recursive: true, force: true })
await mkdir(resolve(stage, 'lib'), { recursive: true })
await mkdir(resolve(stage, 'node_modules'), { recursive: true })

await cp(resolve(root, 'lib/index.js'), resolve(stage, 'lib/index.js'))
for (const file of ['cordis.patch.yml', 'README.md', 'README.zh.md', 'LICENSE']) {
  await cp(resolve(root, file), resolve(stage, file))
}

for (const { source, manifest } of packages) {
  const target = resolve(stage, 'node_modules', manifest.name)
  await mkdir(target, { recursive: true })
  await cp(resolve(source, 'lib'), resolve(target, 'lib'), { recursive: true })
  await cp(resolve(source, 'README.md'), resolve(target, 'README.md'))
  await cp(resolve(source, 'README.zh.md'), resolve(target, 'README.zh.md'))
  await cp(resolve(root, 'LICENSE'), resolve(target, 'LICENSE'))
  await writeFile(
    resolve(target, 'package.json'),
    `${JSON.stringify(publishManifest(manifest, versions), null, 2)}\n`,
  )
}

const packedRoot = publishManifest(rootManifest, versions)
packedRoot.dependencies = Object.fromEntries(packages.map(({ manifest }) => [manifest.name, manifest.version]))
packedRoot.bundledDependencies = packages.map(({ manifest }) => manifest.name)
delete packedRoot.workspaces
delete packedRoot.devDependencies
delete packedRoot.scripts
await writeFile(resolve(stage, 'package.json'), `${JSON.stringify(packedRoot, null, 2)}\n`)
// pnpm only packs bundledDependencies from a hoisted layout, so confine it to staging.
await writeFile(resolve(stage, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\n')

runPnpm(['pack', '--pack-destination', output], stage)
await rm(stage, { recursive: true, force: true })
console.log(`Created ${resolve(output, packageTarballName(rootManifest))}`)
