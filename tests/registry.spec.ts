import { describe, expect, it } from 'vitest'
import { BrowserUseBackendRegistry, browserUseBackendServiceKey, type BrowserUseBackend } from '../src/index.js'

function backend(type: string): BrowserUseBackend {
  return { browserType: type, tools: () => [], execute: async () => ({ content: [] }), release: () => {}, reconfigure: async () => {}, close: async () => {} }
}

describe('BrowserUseBackendRegistry', () => {
  it('registers, resolves, and safely unregisters named backends', () => {
    const registry = new BrowserUseBackendRegistry()
    const chrome = backend('chrome')
    const dispose = registry.register('chrome', chrome)
    expect(registry.get('chrome')).toBe(chrome)
    expect(registry.names()).toEqual(['chrome'])
    dispose()
    expect(() => registry.get('chrome')).toThrow(/not registered/)
  })
  it('rejects duplicate backend names', () => {
    const registry = new BrowserUseBackendRegistry()
    registry.register('chrome', backend('chrome'))
    expect(() => registry.register('chrome', backend('chrome'))).toThrow(/already registered/)
  })
  it('derives stable lifecycle service keys', () => {
    expect(browserUseBackendServiceKey('chrome')).toBe('browserUse.backend.chrome')
  })
})

