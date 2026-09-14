import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserUseSettings } from 'browser-use'
import { ChromeBrowserUseBackend } from 'browser-use-chrome'
import { EdgeBrowserUseBackend } from 'browser-use-edge'
import type { EdgeRuntime } from '../../browser-use-edge/src/connection.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

function fixture(browserType: 'chrome' | 'edge') {
  const runtimes: ReturnType<typeof runtime>[] = []
  const connect = vi.fn(async (_settings: BrowserUseSettings, _owner: object, _signal?: AbortSignal) => {
    const value = runtime()
    runtimes.push(value)
    return value
  })
  const backend = browserType === 'chrome'
    ? new ChromeBrowserUseBackend(() => ({ browserType, browserPath: '', headless: true }), new Context().logger, { toolCallTimeoutMs: 120000 }, connect)
    : new EdgeBrowserUseBackend(connect)
  return { backend, connect, runtimes }
}

function runtime() {
  const callTool = vi.fn<(...args: Parameters<EdgeRuntime['client']['callTool']>) => Promise<{ content: [] }>>(async () => ({ content: [] }))
  // Only MCP discovery and execution are exercised by the backend here.
  const client = { listTools: async () => ({ tools: [{ name: 'action', inputSchema: { type: 'object' } }] }), callTool } as unknown as EdgeRuntime['client']
  const value = { closed: false, client, callTool, close: vi.fn(async () => { value.closed = true }) }
  return value
}

describe.each(['chrome', 'edge'] as const)('%s cancellation', browserType => {
  it('does not connect for a call cancelled before dispatch or while queued', async () => {
    const { backend, connect, runtimes } = fixture(browserType)
    await backend.initialize()
    const gate = deferred()
    try {
      await expect(backend.execute({}, 'action', {}, AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled')
      expect(connect).toHaveBeenCalledTimes(1)
      const owner = {}
      await backend.execute(owner, 'action', {})
      runtimes[1]!.callTool.mockImplementationOnce(async () => { await gate.promise; return { content: [] } })
      const first = backend.execute(owner, 'action', {})
      await vi.waitFor(() => expect(runtimes[1]!.callTool).toHaveBeenCalledTimes(2))
      const controller = new AbortController()
      const second = backend.execute({}, 'action', {}, controller.signal)
      const rejected = expect(second).rejects.toThrow('cancelled')
      controller.abort(new Error('cancelled'))
      gate.resolve()
      await Promise.all([first, rejected])
      expect(connect).toHaveBeenCalledTimes(2)
    } finally { gate.resolve(); await backend.close() }
  })

  it('drains an aborted call before dispatching another, then reconnects its owner', async () => {
    const { backend, connect, runtimes } = fixture(browserType)
    await backend.initialize()
    const owner = {}, other = {}
    const draining = deferred()
    try {
      await backend.execute(owner, 'action', {})
      await backend.execute(other, 'action', {})
      const active = runtimes[1]!, unaffected = runtimes[2]!
      active.callTool.mockImplementationOnce(async (_params, _schema, options) => new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true })
      }))
      active.close.mockImplementationOnce(async () => { await draining.promise; active.closed = true })
      const controller = new AbortController()
      const running = backend.execute(owner, 'action', {}, controller.signal)
      const rejected = expect(running).rejects.toThrow('cancelled')
      await vi.waitFor(() => expect(active.callTool).toHaveBeenCalledTimes(2))
      controller.abort(new Error('cancelled'))
      await vi.waitFor(() => expect(active.close).toHaveBeenCalledOnce())
      const following = backend.execute(other, 'action', {})
      await Promise.resolve()
      expect(unaffected.callTool).toHaveBeenCalledTimes(1)
      expect(unaffected.close).not.toHaveBeenCalled()
      draining.resolve()
      await Promise.all([rejected, following])
      await backend.execute(owner, 'action', {})
      expect(connect).toHaveBeenCalledTimes(4)
      expect(unaffected.close).not.toHaveBeenCalled()
    } finally { draining.resolve(); await backend.close() }
  })

  it('closes a connection that finishes opening after cancellation without calling its tool', async () => {
    const { backend, connect } = fixture(browserType)
    await backend.initialize()
    const gate = deferred(), late = runtime()
    connect.mockImplementationOnce(async () => { await gate.promise; return late })
    const controller = new AbortController()
    try {
      const running = backend.execute({}, 'action', {}, controller.signal)
      const rejected = expect(running).rejects.toThrow('cancelled')
      await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
      controller.abort(new Error('cancelled'))
      gate.resolve()
      await rejected
      expect(late.callTool).not.toHaveBeenCalled()
      expect(late.close).toHaveBeenCalledOnce()
    } finally { gate.resolve(); await backend.close() }
  })

  it('evicts and closes a runtime after an MCP timeout', async () => {
    const { backend, connect, runtimes } = fixture(browserType)
    await backend.initialize()
    const owner = {}
    try {
      await backend.execute(owner, 'action', {})
      runtimes[1]!.callTool.mockRejectedValueOnce(new Error('Request timed out'))
      await expect(backend.execute(owner, 'action', {})).rejects.toThrow('Request timed out')
      expect(runtimes[1]!.close).toHaveBeenCalledOnce()
      await backend.execute(owner, 'action', {})
      expect(connect).toHaveBeenCalledTimes(3)
    } finally { await backend.close() }
  })
})
