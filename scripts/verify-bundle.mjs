import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {basename, dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

// Test the published artifact away from workspace aliases and node_modules.
const root = fileURLToPath(new URL('../', import.meta.url))
const {version} = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const tarball = resolve(root, `.artifacts/pack/dsh-browser-use-${version}.tgz`)
const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {encoding: 'utf8'}))
const parent = resolve(tmpdir())
const stage = await mkdtemp(join(parent, 'dsh-browser-use-verify-'))
try {
    await writeFile(resolve(stage, 'package.json'), JSON.stringify({
        private: true,
        dependencies: {
            ...manifest.peerDependencies,
            'dsh-browser-use': `file:${tarball.replaceAll('\\', '/')}`,
        },
    }))
    // Match the web profile: the host supplies peers, pnpm installs runtime deps.
    await writeFile(resolve(stage, 'pnpm-workspace.yaml'), 'packages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n')
    assert.ok(process.env.npm_execpath, 'Run this check through pnpm verify:bundle')
    execFileSync(process.execPath, [process.env.npm_execpath, 'install', '--ignore-scripts'], {
        cwd: stage, stdio: 'inherit',
    })
    const require = createRequire(resolve(stage, 'package.json'))
    const bundleRequire = createRequire(require.resolve('dsh-browser-use/package.json'))
    for (const name of manifest.bundledDependencies) {
        const pluginPath = bundleRequire.resolve(`${name}/package.json`)
        const plugin = JSON.parse(await readFile(pluginPath, 'utf8'))
        const pluginRequire = createRequire(pluginPath)
        for (const [dependency, range] of Object.entries(plugin.dependencies ?? {})) {
            assert.equal(manifest.dependencies[dependency], range, `${name}: missing root dependency ${dependency}`)
        }
        for (const [peer, range] of Object.entries(plugin.peerDependencies ?? {})) {
            if (!manifest.bundledDependencies.includes(peer)) {
                assert.equal(manifest.peerDependencies[peer], range, `${name}: missing root peer ${peer}`)
            }
        }
        await import(pathToFileURL(bundleRequire.resolve(name)).href)
        if (name === 'browser-use-chrome') {
            const chromePath = pluginRequire.resolve('chrome-devtools-mcp/package.json')
            const chrome = JSON.parse(await readFile(chromePath, 'utf8'))
            await access(resolve(dirname(chromePath), chrome.bin['chrome-devtools-mcp']))
        }
        if (name === 'browser-use-edge') {
            const playwright = await import(pathToFileURL(pluginRequire.resolve('@playwright/mcp')).href)
            assert.equal(typeof playwright.createConnection, 'function')
        }
    }
    console.log('Clean bundle installation: all plugins import and both MCP backends resolve.')
} finally {
    if (dirname(stage) !== parent || !basename(stage).startsWith('dsh-browser-use-verify-')) {
        throw new Error(`Refusing to remove unexpected verification directory: ${stage}`)
    }
    await rm(stage, {recursive: true, force: true})
}
