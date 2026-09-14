import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers/promises'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { beforeEach, expect, it, vi } from 'vitest'

const launchers = vi.hoisted(() => ({ launch: vi.fn(), launchPersistentContext: vi.fn() }))
vi.mock('playwright-core', () => ({ chromium: launchers }))
vi.mock('@playwright/mcp', () => ({
  createConnection: async (_config: unknown, getContext: () => Promise<unknown>) => {
    const server = new Server({ name: 'fixture', version: '1' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))
    server.setRequestHandler(CallToolRequestSchema, async () => { await getContext(); return { content: [] } })
    return server
  },
}))
import { connectEdge } from '../src/connection.ts'

const settings = { browserType: 'edge' as const, browserPath: '', headless: true }
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
function resources() {
  const events = new EventEmitter()
  const browser = { close: vi.fn(async () => {}), newContext: vi.fn(async () => context) }
  const context = { once: events.once.bind(events), browser: () => browser, close: vi.fn(async () => { events.emit('close') }) }
  return { browser, context }
}
beforeEach(() => { vi.resetAllMocks() })

it('keeps catalog discovery lazy and closing idempotent', async () => {
  const runtime = await connectEdge(settings, {})
  await runtime.client.listTools()
  const closing = runtime.close()
  expect(runtime.close()).toBe(closing)
  await closing
  expect(launchers.launch).not.toHaveBeenCalled()
  expect(launchers.launchPersistentContext).not.toHaveBeenCalled()
})

it('waits for both persistent context and browser teardown before resolving close', async () => {
  const { context, browser } = resources()
  const contextGate = deferred(), browserGate = deferred()
  context.close.mockImplementation(async () => { await contextGate.promise })
  browser.close.mockImplementation(async () => { await browserGate.promise })
  launchers.launchPersistentContext.mockResolvedValue(context)
  const runtime = await connectEdge({ ...settings, userDataDir: 'C:/Profiles/Edge' }, {})
  try {
    await runtime.client.callTool({ name: 'action', arguments: {} })
    let finished = false
    const closing = runtime.close().then(() => { finished = true })
    await vi.waitFor(() => expect(context.close).toHaveBeenCalledOnce())
    expect(runtime.closed).toBe(true)
    expect(finished).toBe(false)
    contextGate.resolve()
    await vi.waitFor(() => expect(browser.close).toHaveBeenCalledOnce())
    expect(finished).toBe(false)
    browserGate.resolve()
    await closing
    expect(finished).toBe(true)
    expect(launchers.launch).not.toHaveBeenCalled()
  } finally { contextGate.resolve(); browserGate.resolve(); await runtime.close() }
})

it('drains a pending launch and releases resources acquired after shutdown starts', async () => {
  const { context, browser } = resources()
  const gate = deferred()
  launchers.launch.mockImplementation(async () => { await gate.promise; return browser })
  const runtime = await connectEdge(settings, {})
  try {
    const call = runtime.client.callTool({ name: 'action', arguments: {} }).catch(error => error)
    await vi.waitFor(() => expect(launchers.launch).toHaveBeenCalledOnce())
    let finished = false
    const closing = runtime.close().then(() => { finished = true })
    await setImmediate()
    expect(finished).toBe(false)
    gate.resolve()
    await closing
    await call
    expect(context.close).toHaveBeenCalledOnce()
    expect(browser.close).toHaveBeenCalledOnce()
  } finally { gate.resolve(); await runtime.close() }
})

it('releases a browser if context creation fails', async () => {
  const { browser } = resources()
  browser.newContext.mockRejectedValue(new Error('context creation failed'))
  launchers.launch.mockResolvedValue(browser)
  const runtime = await connectEdge(settings, {})
  try {
    await expect(runtime.client.callTool({ name: 'action', arguments: {} })).rejects.toThrow('context creation failed')
    expect(browser.close).toHaveBeenCalledOnce()
    expect(runtime.closed).toBe(true)
  } finally { await runtime.close() }
})
