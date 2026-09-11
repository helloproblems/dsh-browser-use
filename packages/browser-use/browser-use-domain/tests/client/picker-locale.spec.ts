import { expect, it } from 'vitest'
import { pickerLocale } from '../../src/client/picker-locale.ts'

it('reads the active DSH language on each invocation', () => {
  let active = 'zh-cn'
  const service = { getLocale: () => ({ active }) }
  expect(pickerLocale(service)).toBe('zh-CN')
  active = 'en'
  expect(pickerLocale(service)).toBe('en')
})

it.each([undefined, {}, { getLocale: () => null }, { getLocale: () => ({ active: 123 }) }, { getLocale: () => ({ active: 'bad_locale' }) }])('falls back to the OS when the optional locale service is unavailable or invalid', service => {
  expect(pickerLocale(service)).toBeUndefined()
})
