import { describe, expect, it, vi } from 'vitest'
import { discoverBrowser } from '../packages/browser-use-chrome/src/discovery.js'

function fetcher(live: string[]) {
  return vi.fn(async (input: string | URL | Request) => ({ ok: live.some(url => String(input).startsWith(url)), json: async () => ({ webSocketDebuggerUrl: 'ws://example' }) })) as unknown as typeof fetch
}

describe('discoverBrowser', () => {
  it('prefers a reachable configured address', async () => {
    const found = await discoverBrowser({ browserUrl: 'http://127.0.0.1:9333/', fetchImpl: fetcher(['http://127.0.0.1:9333']), homeDir: 'Z:/missing', ports: [9222] })
    expect(found).toEqual({ url: 'http://127.0.0.1:9333', source: 'configured' })
  })
  it('falls back to scanning local debugging ports', async () => {
    const found = await discoverBrowser({ fetchImpl: fetcher(['http://127.0.0.1:9224']), homeDir: 'Z:/missing', ports: [9222, 9224] })
    expect(found).toEqual({ url: 'http://127.0.0.1:9224', source: 'port-scan' })
  })
  it('returns undefined when no endpoint responds', async () => {
    expect(await discoverBrowser({ fetchImpl: fetcher([]), homeDir: 'Z:/missing', ports: [9222] })).toBeUndefined()
  })
})

