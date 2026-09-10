import { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { expect, it, vi } from 'vitest'
import BrowserUse, { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseSettings } from 'browser-use'
import { apply, inject } from '../src/index.ts'

it('wires settings changes to live Domain tool registrations without restarting', async () => {
  const ctx = new Context()
  await ctx.plugin(BrowserUse)
  const definitions = new Map<string, ToolDefinition>()
  // Only the service methods consumed by Domain are needed in this fixture.
  ctx.provide('tools', { register: (tool: ToolDefinition) => { definitions.set(tool.name, tool); return () => definitions.delete(tool.name) } } as unknown as Context['tools'])
  let value: BrowserUseSettings = { browserType: 'edge', browserPath: 'edge.exe', headless: true }
  let watcher: ((next: BrowserUseSettings, prev: BrowserUseSettings) => unknown) | undefined
  ctx.provide('settings', {
    register: () => ({
      get: () => value,
      watch: (callback: typeof watcher) => { watcher = callback; return () => { watcher = undefined } },
      update: async (patch: Partial<BrowserUseSettings>) => { value = { ...value, ...patch } },
    }),
  } as any)
  for (const browserType of ['edge', 'chrome']) {
    const backend: BrowserUseBackend = {
      browserType, tools: () => [{ name: 'action', description: '', parameters: { type: 'object' } }],
      execute: vi.fn(async () => ({ content: [] })), release: vi.fn(), reconfigure: vi.fn(async () => {}), close: vi.fn(async () => {}),
    }
    ctx.browserUse.backend.register(browserType, backend)
    ctx.provide(browserUseBackendServiceKey(browserType), backend)
  }
  const domain = await ctx.plugin({ apply, inject }, { backend: 'edge', browserType: 'edge', browserPath: 'edge.exe', headless: true, toolCallTimeoutMs: 120000 })
  await vi.waitFor(() => expect([...definitions.keys()]).toEqual(['mcp__edge__action']))
  await vi.waitFor(() => expect(watcher).toBeTypeOf('function'))
  const prev = value
  value = { ...value, browserType: 'chrome', browserPath: 'chrome.exe' }
  await watcher!(value, prev)
  expect([...definitions.keys()]).toEqual(['mcp__chrome__action'])
  await domain.dispose()
  await vi.waitFor(() => expect(definitions.size).toBe(0))
})
