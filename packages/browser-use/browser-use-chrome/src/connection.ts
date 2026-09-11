import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { browserWorkdir, type BrowserUseSettings } from 'browser-use'

export interface ChromeRuntime {
  client: Pick<Client, 'listTools' | 'callTool'>
  readonly closed: boolean
  close(): Promise<void>
}
export type ChromeConnector = (settings: BrowserUseSettings, owner: object) => Promise<ChromeRuntime>

/** Resolve the installed package's declared CLI, rather than importing internals. */
export function chromeServerArgs(settings: BrowserUseSettings): string[] {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('chrome-devtools-mcp/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin: Record<string, string> }
  const bin = manifest.bin['chrome-devtools-mcp']
  if (!bin) throw new Error('chrome-devtools-mcp does not declare its MCP CLI')
  return [
    resolve(dirname(manifestPath), bin),
    ...(settings.userDataDir?.trim() ? ['--user-data-dir', settings.userDataDir.trim()] : ['--isolated']),
    '--no-usage-statistics', '--no-performance-crux',
    '--no-page-id-routing', '--no-slim', '--no-category-extensions',
    '--no-experimental-devtools', '--no-experimental-include-all-pages',
    '--redact-network-headers', '--no-allow-unrestricted-paths',
    ...(settings.headless ? ['--headless'] : []),
    ...(settings.browserPath.trim() ? ['--executable-path', settings.browserPath.trim()] : ['--channel', 'stable']),
  ]
}

export async function connectChrome(settings: BrowserUseSettings, owner: object, log: (message: string) => void): Promise<ChromeRuntime> {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const cwd = browserWorkdir(owner)
  const client = new Client({ name: 'dsh-browser-use-chrome', version: metadata.version }, { capabilities: { roots: {} } })
  client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: [{ uri: pathToFileURL(cwd).href, name: 'workspace' }] }))
  const transport = new StdioClientTransport({
    command: process.execPath, args: chromeServerArgs(settings), cwd, stderr: 'pipe',
    env: { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1', CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' },
  })
  // Drain diagnostics separately; stdout belongs exclusively to MCP JSON-RPC.
  transport.stderr?.on('data', (chunk: Buffer) => log(chunk.toString().trim()))
  let closed = false
  let closing: Promise<void> | undefined
  client.onclose = () => { closed = true }
  client.onerror = error => log(String(error))
  const close = () => {
    closed = true
    return closing ??= client.close().finally(() => transport.close())
  }
  try {
    await client.connect(transport, { timeout: 30_000 })
    return { client, get closed() { return closed }, close }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
