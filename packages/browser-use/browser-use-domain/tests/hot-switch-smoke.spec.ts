import { createServer } from 'node:http'
import { once } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import type { BrowserUseBackend, BrowserUseSettings } from 'browser-use'
import { BackendSwitcher } from '../src/backend-switcher.js'

it.runIf(process.env.BROWSER_SWITCH_SMOKE === '1')('operates Edge, Chrome, then Edge without restarting the switcher', async () => {
  const { EdgeBrowserUseBackend } = await import('../../browser-use-edge/src/index.js')
  const { ChromeBrowserUseBackend } = await import('../../browser-use-chrome/src/index.js')
  const edge = new EdgeBrowserUseBackend()
  const chrome = new ChromeBrowserUseBackend(() => settings('chrome'), new Context().logger, { toolCallTimeoutMs: 120000 })
  const tools = new Map<string, BrowserUseBackend['execute']>()
  const switcher = new BackendSwitcher(settings('edge'), s => s.browserType, (backend, tool, execute) => {
    const name = `${backend.browserType}:${tool.name}`
    tools.set(name, execute)
    return () => { if (tools.get(name) === execute) tools.delete(name) }
  })
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>Hot switch smoke</title><h1>Browser switch works</h1>')
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const owner = {}
  try {
    await edge.initialize()
    await switcher.attach('edge', edge)
    await switcher.attach('chrome', chrome)
    const navigate = tools.get('edge:browser_navigate')!
    expect(JSON.stringify(await navigate(owner, 'browser_navigate', { url }))).toContain('Hot switch smoke')
    await switcher.configure(settings('chrome'))
    expect([...tools.keys()].every(name => name.startsWith('chrome:'))).toBe(true)
    const page = tools.get('chrome:new_page')!
    expect(JSON.stringify(await page(owner, 'new_page', { url }))).toContain(url)
    await switcher.configure(settings('edge'))
    expect([...tools.keys()].every(name => name.startsWith('edge:'))).toBe(true)
    await expect(navigate(owner, 'browser_navigate', { url })).rejects.toThrow('changed')
    expect(JSON.stringify(await tools.get('edge:browser_navigate')!(owner, 'browser_navigate', { url }))).toContain('Hot switch smoke')
  } finally {
    try { await switcher.close() } finally {
      await Promise.allSettled([edge.close(), chrome.close()])
      server.close()
      server.closeAllConnections()
    }
  }
}, 120000)

function settings(browserType: 'edge' | 'chrome'): BrowserUseSettings {
  return { browserType, headless: true, browserPath: '' }
}
