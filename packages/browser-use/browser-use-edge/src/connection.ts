import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createConnection } from '@playwright/mcp'
import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import { browserWorkdir, type BrowserUseSettings } from 'browser-use'

export interface EdgeRuntime {
  client: Client
  readonly closed: boolean
  close(): Promise<void>
}
// Public server API with actual MCP messages, without a subprocess or port.
export async function connectEdge(settings: BrowserUseSettings, owner: object, signal?: AbortSignal): Promise<EdgeRuntime> {
  signal?.throwIfAborted()
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  let closed = false
  let closing: Promise<void> | undefined
  let launching: Promise<BrowserContext> | undefined
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  const launch = async (): Promise<BrowserContext> => {
    const options = {
      channel: 'msedge', headless: settings.headless, chromiumSandbox: true,
      handleSIGINT: false, handleSIGTERM: false,
      args: ['--disable-blink-features=AutomationControlled'],
      ...(settings.browserPath.trim() ? { executablePath: settings.browserPath.trim() } : {}),
    }
    const viewport = settings.headless ? { width: 1280, height: 720 } : null
    try {
      if (settings.userDataDir?.trim()) {
        context = await chromium.launchPersistentContext(settings.userDataDir.trim(), {
          ...options, viewport, ignoreDefaultArgs: ['--disable-extensions'],
        })
        browser = context.browser() ?? undefined
      } else {
        browser = await chromium.launch(options)
        context = await browser.newContext({ viewport })
      }
      context.once('close', () => { closed = true })
      return context
    } catch (error) {
      closed = true
      // A failed context creation can still leave its browser process running.
      await browser?.close()
      throw error
    }
  }
  const server = await createConnection({
    // The supplied context already owns its isolation and launch settings.
    browser: { browserName: 'chromium', isolated: false,
      launchOptions: { channel: 'msedge', headless: settings.headless } },
    capabilities: ['core'], imageResponses: 'allow', allowUnrestrictedFileAccess: false,
  }, async () => {
    if (closed) throw new Error('Edge browser session is closed')
    const ready = await (launching ??= launch())
    if (closed) throw new Error('Edge browser session is closed')
    return ready
  })
  const client = new Client({ name: 'dsh-browser-use-edge', version: metadata.version }, { capabilities: { roots: {} } })
  const cwd = browserWorkdir(owner)
  client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: [{ uri: pathToFileURL(cwd).href, name: 'workspace' }] }))
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client.onclose = () => { closed = true }
  const close = () => {
    closed = true
    return closing ??= (async () => {
      try { await client.close() } finally {
        try { await server.close() } finally {
          // MCP's onclose callback does not await browser disposal. Drain the
          // launch and the resources we own before releasing a profile's lock.
          await launching?.catch(() => {}) // launch() cleans up failed creation.
          try { await context?.close() } finally { await browser?.close() }
        }
      }
    })()
  }
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport, { ...(signal ? { signal } : {}) })
    signal?.throwIfAborted()
    return { client, get closed() { return closed }, close }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
