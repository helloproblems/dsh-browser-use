import { createServer } from 'node:http'
import { once } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { ChromeBrowserUseBackend } from '../src/index.ts'
import { chromeServerArgs, type ChromeRuntime } from '../src/connection.ts'

const settings = { browserType: 'chrome' as const, browserPath: '', headless: true }
function createBackend(connect?: ConstructorParameters<typeof ChromeBrowserUseBackend>[3]) {
  return new ChromeBrowserUseBackend(() => settings, new Context().logger, { toolCallTimeoutMs: 43210 }, connect)
}

describe('Chrome MCP', () => {
  it('discovers real schemas over stdio without launching the configured browser', async () => {
    const backend = createBackend()
    try {
      await backend.reconfigure({ ...settings, browserPath: 'Z:/missing/chrome.exe' })
      await backend.initialize()
      await backend.initialize()
      const names = backend.tools().map(tool => tool.name)
      expect(new Set(names).size).toBe(names.length)
      expect(names).toContain('new_page')
      expect(backend.tools().find(tool => tool.name === 'click')?.parameters).toMatchObject({
        type: 'object', properties: { uid: { type: 'string' }, dblClick: { type: 'boolean' } }, required: ['uid'],
      })
      expect(backend.tools().find(tool => tool.name === 'click')?.parameters.properties).not.toHaveProperty('pageId')
      await expect(backend.execute({}, 'missing', {})).rejects.toThrow('unknown Chrome tool')
    } finally { await backend.close() }
  }, 30000)

  it('passes executable paths as one argument and preserves isolation options', () => {
    const args = chromeServerArgs({ ...settings, browserPath: 'C:/Program Files/Chrome/chrome.exe' })
    expect(args).toContain('--isolated')
    expect(args).toContain('--no-usage-statistics')
    expect(args[args.indexOf('--executable-path') + 1]).toBe('C:/Program Files/Chrome/chrome.exe')
  })

  it('uses the persistent directory instead of isolation when configured', () => {
    const args = chromeServerArgs({ ...settings, userDataDir: ' C:/Browser Data/Chrome ' })
    expect(args).not.toContain('--isolated')
    expect(args[args.indexOf('--user-data-dir') + 1]).toBe('C:/Browser Data/Chrome')
    expect(chromeServerArgs({ ...settings, userDataDir: ' ' })).toContain('--isolated')
  })

  it('isolates owners, forwards timeout/results, recovers a dead connection and drains cleanup', async () => {
    const runtimes: ChromeRuntime[] = []
    const connect = vi.fn(async () => {
      const runtime: ChromeRuntime = {
        closed: false,
        client: {
          listTools: vi.fn(async () => ({ tools: [{ name: 'action', inputSchema: { type: 'object' as const } }] })),
          callTool: vi.fn(async ({ arguments: args }: { arguments?: Record<string, unknown> | undefined }) => args?.fail
            ? { isError: true, content: [{ type: 'text' as const, text: 'server error' }] }
            : { content: [{ type: 'image' as const, data: 'abc', mimeType: 'image/png' }], structuredContent: { ok: true } }),
        },
        close: vi.fn(async () => { Object.assign(runtime, { closed: true }) }),
      }
      runtimes.push(runtime)
      return runtime
    })
    const backend = createBackend(connect)
    const a = {}, b = {}
    await backend.initialize()
    expect(runtimes[0]!.close).toHaveBeenCalledOnce()
    expect(await backend.execute(a, 'action', {})).toMatchObject({ structuredContent: { ok: true }, content: [{ type: 'image' }] })
    expect(runtimes[1]!.client.callTool).toHaveBeenCalledWith({ name: 'action', arguments: {} }, undefined, { timeout: 43210 })
    await backend.execute(a, 'action', {})
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenCalledTimes(3)
    await expect(backend.execute(a, 'action', { fail: true })).rejects.toThrow('server error')
    Object.assign(runtimes[1]!, { closed: true })
    await backend.execute(a, 'action', {})
    expect(connect).toHaveBeenCalledTimes(4)
    backend.release(a)
    await backend.reconfigure(settings)
    expect(runtimes[3]!.close).toHaveBeenCalledOnce()
    expect(runtimes[2]!.close).not.toHaveBeenCalled()
    await backend.reconfigure({ ...settings, headless: false })
    expect(runtimes[2]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    await backend.reconfigure({ ...settings, headless: false, userDataDir: 'C:/Browser Data/Chrome' })
    expect(runtimes[4]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ userDataDir: expect.stringMatching(/workdirs[\\/][a-f0-9]{64}[\\/]chrome$/) }), b)
    const isolated = { ...settings, headless: false, userDataDir: 'C:/Browser Data/Chrome', sessionIsolation: true }
    await backend.reconfigure(isolated)
    expect(runtimes[5]!.close).toHaveBeenCalledOnce()
    await backend.execute(b, 'action', {})
    expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({ userDataDir: expect.stringMatching(/sessions[\\/]chrome[\\/][a-f0-9]{64}$/) }), b)
    backend.release(b)
    await backend.execute(b, 'action', {})
    const calls = vi.mocked(connect).mock.calls as unknown as [Record<string, unknown>, object][]
    expect(calls.at(-1)![0].userDataDir).toBe(calls.at(-2)![0].userDataDir)
    await backend.close()
    await backend.close()
    await expect(backend.execute(a, 'action', {})).rejects.toThrow('disposed')
  })

  it('retries failed initialization and connection without duplicating the catalog', async () => {
    const connect = vi.fn(async () => ({ closed: false, close: vi.fn(async () => {}), client: {
      listTools: vi.fn(async () => ({ tools: [{ name: 'action', inputSchema: { type: 'object' as const } }] })),
      callTool: vi.fn(async () => ({ content: [] })),
    } }))
    connect.mockRejectedValueOnce(new Error('connect failed'))
    const backend = createBackend(connect)
    await expect(backend.initialize()).rejects.toThrow('connect failed')
    await backend.initialize()
    connect.mockRejectedValueOnce(new Error('session failed'))
    const owner = {}
    await expect(backend.execute(owner, 'action', {})).rejects.toThrow('session failed')
    await backend.execute(owner, 'action', {})
    expect(backend.tools()).toHaveLength(1)
    await backend.close()
  })

  it.runIf(process.env.CHROME_SMOKE === '1')('navigates and isolates real Chrome sessions across releases', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end('<title>Chrome MCP smoke</title><h1>Chrome MCP smoke</h1>')
    }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const backend = createBackend()
    const a = {}, b = {}
    try {
      await backend.initialize()
      await backend.execute(a, 'new_page', { url })
      expect(JSON.stringify(await backend.execute(a, 'take_snapshot', {}))).toContain('Chrome MCP smoke')
      await backend.execute(a, 'evaluate_script', { function: "() => { localStorage.setItem('owner', 'agent-a'); return 'stored' }" })
      await backend.execute(b, 'new_page', { url })
      expect(JSON.stringify(await backend.execute(b, 'evaluate_script', { function: "() => localStorage.getItem('owner')" }))).not.toContain('agent-a')
      backend.release(a)
      await backend.execute(a, 'new_page', { url })
      expect(JSON.stringify(await backend.execute(a, 'evaluate_script', { function: "() => localStorage.getItem('owner')" }))).not.toContain('agent-a')
    } finally {
      await backend.close()
      server.close()
      server.closeAllConnections()
    }
  }, 120000)
})
