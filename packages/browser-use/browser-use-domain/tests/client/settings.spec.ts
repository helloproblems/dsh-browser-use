import { describe, expect, it } from 'vitest'
import { readSettings } from '../../src/client/settings.ts'

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
