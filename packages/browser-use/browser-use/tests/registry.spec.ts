import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import BrowserUse, {
  BackendRegistry,
  BrowserUseBackendRegistry,
  BrowserUseError,
  browserUseBackendServiceKey,
  type BrowserUseBackend,
  type BrowserUseErrorCode,
} from '../src/index.js'

function backend(type: string): BrowserUseBackend {
  return {
    browserType: type,
    tools: () => [],
    execute: async () => ({ content: [] }),
    release: () => {},
    reconfigure: async () => {},
    close: async () => {},
  }
}

function expectHubError(run: () => unknown, code: BrowserUseErrorCode): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(BrowserUseError)
  expect(caught).toMatchObject({ code })
}

describe('BackendRegistry', () => {
  it('registers, resolves, and disposes named backends', () => {
    const registry = new BackendRegistry()
    const chrome = backend('chrome')
    const dispose = registry.register('chrome', chrome)

    expect(registry.get('chrome')).toBe(chrome)
    expect(registry.names()).toEqual(['chrome'])

    dispose()
    expect(registry.names()).toEqual([])
    expectHubError(() => registry.get('chrome'), 'backend-not-found')
  })

  it('rejects duplicate backend names with a stable error code', () => {
    const registry = new BackendRegistry()
    registry.register('chrome', backend('chrome'))
    expectHubError(() => registry.register('chrome', backend('chrome')), 'duplicate-backend')
  })

  it('does not let a stale disposer remove a successor registration', () => {
    const registry = new BackendRegistry()
    const first = backend('chrome')
    const second = backend('chrome')
    const staleDispose = registry.register('chrome', first)

    staleDispose()
    registry.register('chrome', second)
    staleDispose()

    expect(registry.get('chrome')).toBe(second)
  })

  it('keeps the previous registry name as a compatibility alias', () => {
    expect(BrowserUseBackendRegistry).toBe(BackendRegistry)
  })
})

describe('BrowserUse service', () => {
  it('derives stable lifecycle service keys', () => {
    expect(browserUseBackendServiceKey('chrome')).toBe('browserUse.backend.chrome')
    expect(browserUseBackendServiceKey('tenant-a')).toBe('browserUse.backend.tenant-a')
  })

  it('mounts on the Cordis context and exposes the backend registry', async () => {
    const ctx = new Context()
    await ctx.plugin(BrowserUse)

    expect(ctx.browserUse).toBeInstanceOf(BrowserUse)
    expect(ctx.browserUse.backend).toBeInstanceOf(BackendRegistry)
  })
})
