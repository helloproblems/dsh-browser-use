import type { Context } from '@deepseek-ai/cordis'
import type { ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { SettingsValue } from '../../src/client/settings.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: 'button', IconFolderOpenOutline16: 'span' }))
import { apply } from '../../src/client/index.tsx'

const renderers: ReactTestRenderer[] = []
afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount() })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function bench(value: unknown = { headless: false, browserType: 'chrome', browserPath: '', userDataDir: '', sessionIsolation: false }) {
  let active = 'en'
  const listeners = new Set<() => void>()
  const locale = {
    getLocale: () => ({ active }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
  }
  const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [{ ns: 'browser-use', revision: 1, value }] } }))
  const replace = vi.fn(async (_ns: string, next: SettingsValue, _revision: number) => ({ ok: true, value: { revision: 2, value: next } }))
  let render!: () => ReactElement
  let navLabel!: () => string
  const register = vi.fn((options: { label: () => string }, callback: () => ReactElement) => { navLabel = options.label; render = callback })
  apply({
    get: () => locale,
    remote: { settings: { describe, replace } },
    slots: { inject: (_name: string, mount: () => void) => mount(), register },
  } as unknown as Context)
  let renderer!: ReactTestRenderer
  await act(async () => { renderer = create(render()) })
  renderers.push(renderer)
  const switchLocale = (language: string) => act(() => { active = language; for (const listener of listeners) listener() })
  const text = () => renderer.root.findAll(node => typeof node.type === 'string').flatMap(node => [
    ...node.children.filter(child => typeof child === 'string'),
    ...['aria-label', 'placeholder', 'title'].map(key => node.props[key] as unknown).filter(value => typeof value === 'string'),
  ]).join(' ')
  return { renderer, text, switchLocale, describe, replace, register, navLabel, listeners }
}

it('updates every settings field and the navigation label without reloading or losing a draft', async () => {
  const b = await bench()
  const root = b.renderer.root
  expect(b.navLabel()).toBe('Browser automation')
  expect(b.text()).toContain('Data isolation level')
  expect(b.text()).not.toMatch(/[\u4e00-\u9fff]/)
  act(() => {
    root.findByProps({ 'aria-label': 'Browser location' }).props.onChange({ target: { value: 'C:/Browsers/chrome.exe' } })
  })
  act(() => { root.findByProps({ 'aria-label': 'Browser user data directory' }).props.onChange({ target: { value: 'relative' } }) })
  expect(b.text()).toContain('must be an absolute path')
  b.switchLocale('zh-CN')
  expect(b.navLabel()).toBe('浏览器自动化')
  expect(b.text()).toContain('数据隔离级别')
  expect(b.text()).toContain('必须填写绝对路径')
  expect(root.findByProps({ 'aria-label': '浏览器位置' }).props.value).toBe('C:/Browsers/chrome.exe')
  act(() => { root.findByProps({ 'aria-label': '浏览器用户数据目录' }).props.onChange({ target: { value: 'C:/Profiles' } }) })
  act(() => { root.findByProps({ 'aria-label': '数据隔离级别' }).props.onChange({ target: { value: 'session' } }) })
  b.switchLocale('en-US')
  expect(root.findByProps({ 'aria-label': 'Browser user data directory' }).props.value).toBe('C:/Profiles')
  expect(root.findByProps({ 'aria-label': 'Data isolation level' }).props.value).toBe('session')
  await act(async () => { root.findAllByType('button').find(button => button.children.includes('Save'))!.props.onClick() })
  expect(b.replace).toHaveBeenCalledWith('browser-use', expect.objectContaining({ browserPath: 'C:/Browsers/chrome.exe', userDataDir: 'C:/Profiles', sessionIsolation: true }), 1)
  expect(b.describe).toHaveBeenCalledTimes(1)
  expect(b.register).toHaveBeenCalledTimes(1)
  act(() => { b.renderer.unmount() })
  expect(b.listeners.size).toBe(0)
})

function pendingPicker() {
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

it('keeps a pending picker cancellable across a language switch and sends the latest locale next time', async () => {
  const fetch = pendingPicker()
  const b = await bench()
  const root = b.renderer.root
  await act(async () => { root.findByProps({ title: 'Select Browser location' }).props.onClick() })
  expect(fetch.mock.calls[0]![0]).toContain('locale=en')
  expect(b.text()).toContain('Cancel')
  b.switchLocale('zh')
  expect(b.text()).toContain('取消选择')
  await act(async () => { root.findByProps({ title: '正在等待系统选择窗口；点击取消选择' }).props.onClick() })
  expect(fetch.mock.calls[0]![1].signal!.aborted).toBe(true)
  expect(b.text()).not.toContain('取消选择')
  await act(async () => { root.findByProps({ title: '选择浏览器位置' }).props.onClick() })
  expect(fetch.mock.calls[1]![0]).toContain('locale=zh')
  await act(async () => { root.findByProps({ title: '正在等待系统选择窗口；点击取消选择' }).props.onClick() })
  expect(b.describe).toHaveBeenCalledTimes(1)
})

it('retranslates a timeout error already on screen', async () => {
  pendingPicker()
  const b = await bench()
  vi.useFakeTimers()
  await act(async () => { b.renderer.root.findByProps({ title: 'Select Browser location' }).props.onClick() })
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(b.text()).toContain('selection dialog timed out')
  b.switchLocale('zh-Hans')
  expect(b.text()).toContain('选择窗口等待超时')
  expect(b.text()).not.toContain('selection dialog timed out')
})

it('localizes invalid remote settings and falls back to English for other locales', async () => {
  const b = await bench({ browserType: 'unknown' })
  expect(b.text()).toContain('Invalid browser automation settings')
  b.switchLocale('zh')
  expect(b.text()).toContain('浏览器自动化设置格式无效')
  b.switchLocale('fr')
  expect(b.text()).toContain('Invalid browser automation settings')
  expect(b.describe).toHaveBeenCalledTimes(1)
})

it('keeps a save in flight when switching languages', async () => {
  const b = await bench()
  let finish!: (value: Awaited<ReturnType<typeof b.replace>>) => void
  b.replace.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { b.renderer.root.findAllByType('button').find(button => button.children.includes('Save'))!.props.onClick() })
  expect(b.text()).toContain('Saving…')
  b.switchLocale('zh')
  expect(b.text()).toContain('正在保存…')
  expect(b.replace).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ ok: true, value: { revision: 2, value: b.replace.mock.calls[0]![1] } }) })
  expect(b.text()).not.toContain('正在保存…')
  expect(b.describe).toHaveBeenCalledTimes(1)
})

it('translates owned picker errors rather than displaying the host language', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'browser-not-found', error: '未找到浏览器' }), { status: 500 })))
  const b = await bench()
  await act(async () => { b.renderer.root.findByProps({ title: 'Select Browser location' }).props.onClick() })
  expect(b.text()).toContain('No Google Chrome executable was found')
  expect(b.text()).not.toMatch(/[\u4e00-\u9fff]/)
  b.switchLocale('zh')
  expect(b.text()).toContain('所选目录中未找到 Google Chrome')
})
