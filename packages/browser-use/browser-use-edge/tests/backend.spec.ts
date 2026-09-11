import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { EdgeBrowserUseBackend } from '../src/index.ts'

const settings = { browserType: 'edge' as const, browserPath: '', headless: true }

describe('Edge MCP backend', () => {
  it('discovers the real MCP catalog without launching Edge', async () => {
    const backend = new EdgeBrowserUseBackend()
    try {
      await backend.initialize()
      expect(backend.tools().map(tool => tool.name)).toContain('browser_navigate')
      expect(backend.tools().find(tool => tool.name === 'browser_click')?.parameters.type).toBe('object')
      await expect(backend.execute({}, 'not_a_tool', {})).rejects.toThrow('unknown Edge tool')
    } finally { await backend.close() }
  })

  it('isolates owners, preserves results, propagates errors and recycles sessions', async () => {
    const runtimes: { close: ReturnType<typeof vi.fn>; client: Client }[] = []
    const connect = vi.fn(async () => {
      const runtime = {
        close: vi.fn(async () => {}),
        client: {
          listTools: vi.fn(async () => ({ tools: [{ name: 'action', inputSchema: { type: 'object' } }] })),
          callTool: vi.fn(async ({ arguments: args }: { arguments?: Record<string, unknown> | undefined }) => args?.fail
            ? { isError: true, content: [{ type: 'text', text: 'action failed' }] }
            : { content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }], structuredContent: { ok: true } }),
        } as unknown as Client,
      }
      runtimes.push(runtime)
      return runtime
    })
    const backend = new EdgeBrowserUseBackend(connect, undefined, { toolCallTimeoutMs: 43210 })
    await backend.initialize()
    expect(runtimes[0]!.close).toHaveBeenCalledOnce()
    const a = {}, b = {}
    const result = await backend.execute(a, 'action', {})
    expect(runtimes[1]!.client.callTool).toHaveBeenCalledWith({ name: 'action', arguments: {} }, undefined, { timeout: 43210 })
    expect(result.structuredContent).toEqual({ ok: true })
    expect(result.content[0]).toMatchObject({ type: 'image' })
    await backend.execute(a, 'action', {})
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenCalledTimes(3)
    await expect(backend.execute(a, 'action', { fail: true })).rejects.toThrow('action failed')
    backend.release(a)
    await backend.execute(b, 'action', {})
    expect(runtimes[1]!.close).toHaveBeenCalledOnce()
    expect(runtimes[2]!.close).not.toHaveBeenCalled()
    await backend.reconfigure(settings)
    expect(runtimes[2]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    await backend.reconfigure(settings)
    expect(runtimes[3]!.close).not.toHaveBeenCalled()
    await backend.reconfigure({ ...settings, userDataDir: 'C:/Browser Data/Edge' })
    expect(runtimes[3]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ userDataDir: expect.stringMatching(/workdirs[\\/][a-f0-9]{64}[\\/]edge$/) }), b)
    await backend.reconfigure({ ...settings, userDataDir: 'C:/Browser Data/Edge', sessionIsolation: true })
    expect(runtimes[4]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ userDataDir: expect.stringMatching(/sessions[\\/]edge[\\/][a-f0-9]{64}$/) }), b)
    await backend.close()
    await backend.close()
    expect(runtimes[3]!.close).toHaveBeenCalledOnce()
    await expect(backend.execute(a, 'action', {})).rejects.toThrow('disposed')
  })

  it.runIf(process.env.EDGE_SMOKE === '1')('navigates, clicks and isolates real Edge sessions', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end('<title>Edge MCP smoke</title><button onclick="localStorage.setItem(\'clicked\',\'yes\');this.textContent=\'Done\'">Run</button>')
    }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as { port: number }
    const backend = new EdgeBrowserUseBackend()
    const a = {}, b = {}
    try {
      await backend.initialize()
      await backend.reconfigure(settings)
      const url = `http://127.0.0.1:${address.port}`
      const result = await backend.execute(a, 'browser_navigate', { url })
      expect(JSON.stringify(result)).toContain('Edge MCP smoke')
      await backend.execute(a, 'browser_click', { target: "getByRole('button', { name: 'Run' })" })
      expect(JSON.stringify(await backend.execute(a, 'browser_snapshot', {}))).toContain('Done')
      await backend.execute(b, 'browser_navigate', { url })
      const state = await backend.execute(b, 'browser_evaluate', { function: "() => localStorage.getItem('clicked')" })
      expect(JSON.stringify(state)).not.toContain('yes')
    } finally {
      await backend.close()
      server.close()
      server.closeAllConnections()
    }
  }, 90_000)
})
