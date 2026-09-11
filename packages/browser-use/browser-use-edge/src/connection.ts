import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createConnection } from '@playwright/mcp'
import { browserWorkdir, type BrowserUseSettings } from 'browser-use'

export interface EdgeRuntime {
  client: Client
  close(): Promise<void>
}
// Public server API with actual MCP messages, without a subprocess or port.
export async function connectEdge(settings: BrowserUseSettings, owner: object): Promise<EdgeRuntime> {
  const server = await createConnection({
    browser: {
      browserName: 'chromium',
      ...(settings.userDataDir?.trim() ? { isolated: false, userDataDir: settings.userDataDir.trim() } : { isolated: true }),
      launchOptions: { channel: 'msedge', headless: settings.headless, ...(settings.browserPath.trim() ? { executablePath: settings.browserPath.trim() } : {}) },
    },
    capabilities: ['core'], imageResponses: 'allow', allowUnrestrictedFileAccess: false,
  })
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const client = new Client({ name: 'dsh-browser-use-edge', version: metadata.version }, { capabilities: { roots: {} } })
  const cwd = browserWorkdir(owner)
  client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: [{ uri: pathToFileURL(cwd).href, name: 'workspace' }] }))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const close = async () => {
    try { await client.close() } finally { await server.close() }
  }
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return { client, close }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
