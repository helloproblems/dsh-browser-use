import type { Context } from '@deepseek-ai/cordis'
import { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseSettings } from 'browser-use'

export const name = 'browser-use-edge'
export const inject = ['browserUse']

export class EdgeBrowserUseBackend implements BrowserUseBackend {
  readonly browserType = 'edge'
  tools() { return [] }
  execute(): Promise<never> { return Promise.reject(new Error('browser-use-edge is reserved for a future Edge implementation')) }
  release(): void {}
  reconfigure(_settings: BrowserUseSettings): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
}

export function apply(ctx: Context): void {
  const backend = new EdgeBrowserUseBackend()
  ctx.effect(() => ctx.browserUse.backend.register('edge', backend))
  ctx.provide(browserUseBackendServiceKey('edge'), backend)
}

