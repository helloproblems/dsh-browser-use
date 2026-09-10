import { describe, expect, it, vi } from 'vitest'
import type { BrowserUseBackend, BrowserUseSettings } from 'browser-use'
import { BackendSwitcher } from '../src/backend-switcher.js'

const settings = (browserType: 'edge' | 'chrome'): BrowserUseSettings => ({ browserType, browserPath: '', headless: true })
function backend(browserType: string): BrowserUseBackend {
  return { browserType, tools: () => [{ name: 'action', description: '', parameters: {} }], execute: vi.fn(async () => ({ content: [] })), release: vi.fn(), reconfigure: vi.fn(async () => {}), close: vi.fn(async () => {}) }
}
function setup() {
  const tools = new Map<string, BrowserUseBackend['execute']>()
  const switcher = new BackendSwitcher(settings('edge'), s => s.browserType, (backend, tool, execute) => {
    const name = `${backend.browserType}:${tool.name}`
    tools.set(name, execute)
    return () => { if (tools.get(name) === execute) tools.delete(name) }
  })
  return { switcher, tools, edge: backend('edge'), chrome: backend('chrome') }
}

describe('backend hot switching', () => {
  it('switches both ways, removes old tools, releases owners and rejects stale tool references', async () => {
    const { switcher, tools, edge, chrome } = setup()
    await switcher.attach('edge', edge)
    await switcher.attach('chrome', chrome)
    const stale = tools.get('edge:action')!
    const owner = {}
    await stale(owner, 'action', {})
    await switcher.configure(settings('chrome'))
    expect([...tools.keys()]).toEqual(['chrome:action'])
    expect(edge.release).toHaveBeenCalledWith(owner)
    expect(edge.close).not.toHaveBeenCalled()
    await expect(stale(owner, 'action', {})).rejects.toThrow('changed')
    await switcher.configure(settings('edge'))
    expect([...tools.keys()]).toEqual(['edge:action'])
    await switcher.close()
    expect(tools.size).toBe(0)
  })

  it('waits for in-flight operations before releasing the old session', async () => {
    const { switcher, tools, edge, chrome } = setup()
    let finish!: () => void
    const waiting = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(edge.execute).mockImplementation(async () => { await waiting; return { content: [] } })
    await switcher.attach('edge', edge)
    await switcher.attach('chrome', chrome)
    const call = tools.get('edge:action')!({}, 'action', {})
    const change = switcher.configure(settings('chrome'))
    await Promise.resolve()
    expect(edge.release).not.toHaveBeenCalled()
    expect(tools.has('edge:action')).toBe(true)
    finish()
    await Promise.all([call, change])
    expect(edge.release).toHaveBeenCalledOnce()
    expect([...tools.keys()]).toEqual(['chrome:action'])
    await switcher.close()
  })

  it('keeps the working backend on missing or failed target and retries when it becomes available', async () => {
    const { switcher, tools, edge, chrome } = setup()
    await switcher.attach('edge', edge)
    await expect(switcher.configure(settings('chrome'))).rejects.toThrow('unavailable')
    expect([...tools.keys()]).toEqual(['edge:action'])
    vi.mocked(chrome.reconfigure).mockRejectedValueOnce(new Error('cannot configure'))
    await expect(switcher.attach('chrome', chrome)).rejects.toThrow('cannot configure')
    expect([...tools.keys()]).toEqual(['edge:action'])
    await switcher.configure(settings('chrome'))
    expect([...tools.keys()]).toEqual(['chrome:action'])
    await switcher.detach('chrome', chrome)
    expect(tools.size).toBe(0)
    await switcher.attach('chrome', chrome)
    expect([...tools.keys()]).toEqual(['chrome:action'])
    await switcher.close()
  })

  it('honors rapid switches in order and cannot reactivate after disposal', async () => {
    const { switcher, tools, edge, chrome } = setup()
    await switcher.attach('edge', edge)
    await switcher.attach('chrome', chrome)
    await Promise.all([switcher.configure(settings('chrome')), switcher.configure(settings('edge'))])
    expect([...tools.keys()]).toEqual(['edge:action'])
    await switcher.close()
    await switcher.attach('chrome', chrome)
    await switcher.configure(settings('chrome'))
    expect(tools.size).toBe(0)
  })
})
