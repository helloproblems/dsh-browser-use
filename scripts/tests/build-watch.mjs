import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('watch rebuilds both faces, preserves outputs, recovers, and shuts down', { timeout: 90000 }, async () => {
  const cache = join(root, '.cache')
  await mkdir(cache, { recursive: true })
  const fixture = await mkdtemp(join(cache, 'watch-test-'))
  let child
  let output = ''
  const write = async (path, text) => writeFile(join(fixture, path), text)
  const json = (path, value) => write(path, JSON.stringify(value))
  const names = ['browser-use', 'browser-use-chrome', 'browser-use-domain', 'browser-use-edge']
  const packagePath = name => `packages/browser-use/${name}`
  const waitFor = async predicate => {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (await predicate()) return
      assert.equal(child.exitCode, null, output)
      await delay(100)
    }
    assert.fail(`Timed out waiting for watcher:\n${output}`)
  }
  const read = path => readFile(join(fixture, path), 'utf8')
  const host = `${packagePath('browser-use')}/lib/index.js`
  const client = `${packagePath('browser-use-domain')}/lib/client.js`
  const clientSource = `${packagePath('browser-use-domain')}/src/client/index.ts`
  try {
    await mkdir(join(fixture, 'scripts'), { recursive: true })
    await copyFile(join(root, 'scripts/build.mjs'), join(fixture, 'scripts/build.mjs'))
    await json('package.json', { type: 'module' })
    for (const name of names) {
      const base = packagePath(name)
      await mkdir(join(fixture, base, 'src'), { recursive: true })
      await write(`${base}/src/index.ts`, `export const value = '${name}-initial'\n`)
      await json(`${base}/tsconfig.json`, {
        compilerOptions: { composite: true, target: 'ES2022', module: 'NodeNext', rootDir: 'src', outDir: 'lib/types', types: [], tsBuildInfoFile: 'lib/host.tsbuildinfo' },
        include: ['src/*.ts'],
      })
    }
    const domain = packagePath('browser-use-domain')
    await mkdir(join(fixture, domain, 'src/client'), { recursive: true })
    await write(clientSource, "export const value = 'client-initial'\n")
    await json(`${domain}/tsconfig.client.json`, {
      compilerOptions: { composite: true, target: 'ES2022', module: 'NodeNext', rootDir: 'src', outDir: 'lib/types', types: [], tsBuildInfoFile: 'lib/client.tsbuildinfo' },
      include: ['src/client/*.ts'],
    })
    await json('tsconfig.host.json', { files: [], references: names.map(name => ({ path: `${packagePath(name)}/tsconfig.json` })) })
    await json('tsconfig.client.json', { files: [], references: [{ path: `${domain}/tsconfig.client.json` }] })
    child = fork(join(fixture, 'scripts/build.mjs'), ['--watch'], {
      cwd: fixture,
      silent: true,
      // Deliver a portable graceful interrupt, including on Windows where
      // ChildProcess.kill('SIGINT') would forcibly terminate the parent only.
      execArgv: ['--import', 'data:text/javascript,process.on("message", () => { process.disconnect(); process.emit("SIGINT") })'],
    })
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    await waitFor(() => output.includes('Watching TypeScript and Host/Client'))
    for (const name of names) assert.match(await read(`${packagePath(name)}/lib/index.js`), new RegExp(`${name}-initial`))
    let loaded
    vm.runInNewContext(await read(client), { window: { __ModuleLoader__: { load: module => { loaded = module } } } })
    assert.equal(loaded.id, 'browser-use-domain')
    assert.equal(loaded.factory(() => { throw new Error('Unexpected require') }).value, 'client-initial')
    await waitFor(() => output.includes('Watching for file changes'))
    const sentinel = `${domain}/lib/keep.txt`
    await write(sentinel, 'preserved')
    const before = (await stat(join(fixture, host))).mtimeMs
    await write(`${packagePath('browser-use')}/src/index.ts`, "export const value = 'host-updated'\n")
    await write(clientSource, "export const value = 'client-updated'\n")
    await waitFor(async () => (await read(host)).includes('host-updated') && (await read(client)).includes('client-updated'))
    assert.notEqual((await stat(join(fixture, host))).mtimeMs, before)
    assert.equal(await read(sentinel), 'preserved')
    await delay(1000)
    const stable = (await stat(join(fixture, client))).mtimeMs
    // Identical source must not republish a runtime file.
    await write(clientSource, "export const value = 'client-updated'\n")
    await delay(1500)
    assert.equal((await stat(join(fixture, client))).mtimeMs, stable)
    await write(clientSource, 'export const value = ;\n')
    await waitFor(() => output.includes('error TS'))
    await delay(1500)
    assert.match(await read(client), /client-updated/)
    await write(clientSource, "export const value = 'client-recovered'\n")
    await waitFor(async () => (await read(client)).includes('client-recovered'))
    const closed = once(child, 'close')
    child.send('stop')
    assert.deepEqual(await closed, [130, null])
  } finally {
    if (child?.connected) {
      const closed = once(child, 'close')
      child.send('stop')
      await closed
    }
    await rm(fixture, { recursive: true, force: true })
  }
})
