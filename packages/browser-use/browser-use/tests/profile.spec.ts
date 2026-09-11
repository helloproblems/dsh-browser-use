import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { browserWorkdir, sessionBrowserSettings } from '../src/profile.ts'
import type { BrowserUseSettings } from '../src/backend.ts'

const settings: BrowserUseSettings = { browserType: 'chrome', browserPath: '', headless: true, userDataDir: '/profiles', sessionIsolation: true }
const owner = (id: string, cwd = '/workspace') => ({ session: { id, header: { cwd } } })

describe('session profile directories', () => {
  it('separates sessions and browsers and reuses restored session IDs', () => {
    const first = sessionBrowserSettings(settings, owner('one')).userDataDir
    expect(sessionBrowserSettings(settings, owner('one')).userDataDir).toBe(first)
    expect(sessionBrowserSettings(settings, owner('two')).userDataDir).not.toBe(first)
    expect(sessionBrowserSettings({ ...settings, browserType: 'edge' }, owner('one')).userDataDir).not.toBe(first)
    expect(settings.userDataDir).toBe('/profiles')
  })
  it('keeps unsafe session IDs contained inside the browser directory', () => {
    const path = sessionBrowserSettings(settings, owner('../../C:\\evil')).userDataDir!
    expect(relative('/profiles', path).replace(/\\/g, '/')).toMatch(/^workdirs\/[a-f0-9]{64}\/sessions\/chrome\/[a-f0-9]{64}$/)
  })
  it('isolates owners without IDs and keeps their directory stable', () => {
    const first = {}, second = {}
    const path = sessionBrowserSettings(settings, first).userDataDir
    expect(sessionBrowserSettings(settings, first).userDataDir).toBe(path)
    expect(sessionBrowserSettings(settings, second).userDataDir).not.toBe(path)
  })
  it('preserves shared and temporary modes', () => {
    const shared = { ...settings, sessionIsolation: false }
    expect(sessionBrowserSettings(shared, owner('one')).userDataDir).toBe(sessionBrowserSettings(shared, owner('two')).userDataDir)
    expect(sessionBrowserSettings({ ...settings, userDataDir: '' }, owner('one')).userDataDir).toBe('')
  })
  it.each([true, false])('isolates workdirs with session isolation %s', sessionIsolation => {
    const config = { ...settings, sessionIsolation }
    const first = sessionBrowserSettings(config, owner('one', '/project-a')).userDataDir
    expect(sessionBrowserSettings(config, owner('one', '/project-b')).userDataDir).not.toBe(first)
    expect(sessionBrowserSettings(config, owner('one', '/project-a/sub/..')).userDataDir).toBe(first)
    expect(sessionBrowserSettings({ ...config, browserType: 'edge' }, owner('one', '/project-a')).userDataDir).not.toBe(first)
  })
  it('uses the execution owner workspace before the process directory', () => {
    expect(browserWorkdir(owner('one', '/project-a'))).toBe(resolve('/project-a'))
    expect(browserWorkdir({})).toBe(resolve(process.cwd()))
  })
})
