import { describe, expect, it } from 'vitest'
import { browserPathError, readSettings } from '../../src/client/settings.ts'

describe('browser settings replies', () => {
  it.each(['chrome', 'edge'])('decodes %s settings', browserType => {
    const value = { browserType, headless: true, browserPath: 'C:/Browser/browser.exe' }
    expect(readSettings(value)).toEqual(value)
  })

  it.each([null, [], {}, { browserType: 'firefox', headless: true, browserPath: '' },
    { browserType: 'chrome', headless: 'false', browserPath: '' },
    { browserType: 'edge', headless: false, browserPath: null },
  ])('rejects malformed Remote values: %j', value => {
    expect(() => readSettings(value)).toThrow('浏览器自动化设置格式无效')
  })
})

describe('picked browser executable', () => {
  it.each([
    ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'edge'],
    ['C:/Browsers/MSEDGE.EXE', 'edge'],
    ['/opt/microsoft/msedge/msedge', 'edge'],
    ['/usr/bin/microsoft-edge-stable', 'edge'],
    ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'edge'],
    ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'chrome'],
    ['/usr/bin/google-chrome', 'chrome'],
    ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'chrome'],
  ] as const)('validates %s without changing the selected type or path', (browserPath, browserType) => {
    const settings = Object.freeze({ browserType, headless: true, browserPath })
    expect(browserPathError(settings)).toBe('')
    const mismatched = Object.freeze({ ...settings, browserType: browserType === 'edge' ? 'chrome' as const : 'edge' as const })
    expect(browserPathError(mismatched)).toContain('不匹配')
  })

  it.each(['edge', 'chrome'] as const)('rejects unknown launchers for %s and permits automatic discovery', browserType => {
    const settings = { browserType, headless: false, browserPath: 'C:/chrome/msedge-wrapper.exe' }
    expect(browserPathError(settings)).toContain('无法从文件名确认浏览器类型')
    expect(browserPathError({ ...settings, browserPath: '   ' })).toBe('')
  })

  it('revalidates when the type changes and when the path is corrected', () => {
    const settings = { browserType: 'chrome' as const, headless: false, browserPath: 'C:/Browsers/msedge.exe' }
    expect(browserPathError(settings)).toContain('不匹配')
    expect(browserPathError({ ...settings, browserType: 'edge' })).toBe('')
    expect(browserPathError({ ...settings, browserPath: 'C:/Browsers/chrome.exe' })).toBe('')
  })
})
