import { describe, expect, it, vi } from 'vitest'
import { browserExecutableCandidates, discoverBrowserExecutable } from '../src/executable.js'

describe('browser executable discovery', () => {
  it('includes Chrome and Edge stable locations on Windows', () => {
    const env = {
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    }
    expect(browserExecutableCandidates('chrome', { platformName: 'win32', env, homeDir: 'C:\\Users\\test' }))
      .toContain('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    expect(browserExecutableCandidates('edge', { platformName: 'win32', env, homeDir: 'C:\\Users\\test' }))
      .toContain('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
  })

  it('returns the first executable candidate', async () => {
    const accessImpl = vi.fn(async (path: string) => {
      if (path !== '/browser/two') throw new Error('missing')
    })
    await expect(discoverBrowserExecutable('chrome', {
      candidates: ['/browser/one', '/browser/two', '/browser/three'],
      accessImpl,
    })).resolves.toBe('/browser/two')
    expect(accessImpl.mock.calls.map(call => call[0])).toEqual(['/browser/one', '/browser/two'])
  })

  it('returns undefined when no candidate is executable', async () => {
    await expect(discoverBrowserExecutable('chrome', {
      candidates: ['/browser/missing'],
      accessImpl: async () => { throw new Error('missing') },
    })).resolves.toBeUndefined()
  })
})
