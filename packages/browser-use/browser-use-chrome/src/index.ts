import type { Context } from '@deepseek-ai/cordis'
import { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseResult, type BrowserUseSettings, type BrowserUseTool } from 'browser-use'
import { Config, type Config as ChromeConfig } from './config.ts'
import { connectChrome, type ChromeConnector, type ChromeRuntime } from './connection.ts'

export const name = 'browser-use-chrome'
export const inject = ['browserUse']
export { Config }

export class ChromeBrowserUseBackend implements BrowserUseBackend {
  readonly browserType = 'chrome'
  private catalog: BrowserUseTool[] = []
  private initialized = false
  private settings: BrowserUseSettings
  private readonly sessions = new Map<object, ChromeRuntime>()
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  private closing?: Promise<void>
  private readonly connect: ChromeConnector

  constructor(settings: () => BrowserUseSettings, private readonly logger: Context['logger'], private readonly config: ChromeConfig, connect?: ChromeConnector) {
    this.settings = { ...settings() }
    this.connect = connect ?? ((settings, owner) => connectChrome(settings, owner, message => logger.debug(message)))
  }

  initialize(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive()
      if (this.initialized) return
      const runtime = await this.connect(this.settings, {})
      const catalog: BrowserUseTool[] = []
      try {
        let cursor: string | undefined
        do {
          const result = await runtime.client.listTools({ cursor })
          catalog.push(...result.tools.map(tool => ({ name: tool.name, description: tool.description ?? '', parameters: tool.inputSchema })))
          cursor = result.nextCursor
        } while (cursor)
        this.catalog = catalog
        this.initialized = true
      } finally { await runtime.close() }
    })
  }

  tools(): readonly BrowserUseTool[] { return this.catalog }

  execute(owner: object, toolName: string, args: Record<string, unknown>): Promise<BrowserUseResult> {
    if (this.disposed) return Promise.reject(new Error('Chrome browser-use backend is disposed'))
    return this.enqueue(async () => {
      if (!this.initialized) throw new Error('Chrome MCP backend is not initialized')
      if (!this.catalog.some(tool => tool.name === toolName)) throw new Error(`unknown Chrome tool '${toolName}'`)
      let runtime = this.sessions.get(owner)
      if (!runtime || runtime.closed) {
        this.sessions.delete(owner)
        await runtime?.close()
        runtime = await this.connect(this.settings, owner)
        this.sessions.set(owner, runtime)
      }
      const result = await runtime.client.callTool({ name: toolName, arguments: args }, undefined, { timeout: this.config.toolCallTimeoutMs })
      const content = (result.content ?? []) as BrowserUseResult['content']
      if (result.isError) {
        const message = content.flatMap(item => item && typeof item === 'object' && !Array.isArray(item) && item.type === 'text' ? [String(item.text)] : []).join('\n')
        throw new Error(message || `${toolName} failed`)
      }
      return { content, ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent as Exclude<BrowserUseResult['structuredContent'], undefined> }) }
    })
  }

  release(owner: object): void {
    void this.enqueue(async () => {
      const runtime = this.sessions.get(owner)
      this.sessions.delete(owner)
      await runtime?.close()
    }).catch(error => this.logger.warn(String(error)))
  }

  reconfigure(settings: BrowserUseSettings): Promise<void> {
    const next = { ...settings }
    return this.enqueue(async () => {
      this.assertActive()
      if (next.browserType !== 'chrome') throw new Error('Chrome backend requires browserType: chrome')
      if (next.headless === this.settings.headless && next.browserPath === this.settings.browserPath) return
      this.settings = next
      await this.reset()
    })
  }

  close(): Promise<void> {
    this.disposed = true
    return this.closing ??= this.enqueue(() => this.reset())
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Chrome browser-use backend is disposed')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(operation)
    this.queue = pending.catch(() => {})
    return pending
  }

  private async reset(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    const results = await Promise.allSettled(sessions.map(runtime => runtime.close()))
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length) throw new AggregateError(errors, 'Failed to close Chrome MCP sessions')
  }
}

export async function apply(ctx: Context, config: ChromeConfig): Promise<void> {
  const fallback: BrowserUseSettings = { headless: false, browserType: 'chrome', browserPath: '' }
  const backend = new ChromeBrowserUseBackend(() => fallback, ctx.logger, config)
  ctx.effect(() => () => backend.close())
  await backend.initialize()
  ctx.effect(() => ctx.browserUse.backend.register('chrome', backend))
  ctx.provide(browserUseBackendServiceKey('chrome'), backend)
}
