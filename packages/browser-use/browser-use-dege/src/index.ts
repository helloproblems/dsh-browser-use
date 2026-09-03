import type { Context } from '@deepseek-ai/cordis'
import { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseSettings } from 'browser-use'

export const name = 'browser-use-dege'
export const inject = ['browserUse']

export class DegeBrowserUseBackend implements BrowserUseBackend {
  readonly browserType = 'dege'
  tools() { return [] }
  execute(): Promise<never> { return Promise.reject(new Error('browser-use-dege is reserved for a future Edge implementation')) }
  release(): void {}
  reconfigure(_settings: BrowserUseSettings): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
}

export function apply(ctx: Context): void {
  const backend = new DegeBrowserUseBackend()
  ctx.effect(() => ctx.browserUse.backend.register('dege', backend))
  ctx.provide(browserUseBackendServiceKey('dege'), backend)
}

