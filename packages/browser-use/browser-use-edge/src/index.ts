import type { Context } from '@deepseek-ai/cordis'
import { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseResult, type BrowserUseSettings, type BrowserUseTool } from 'browser-use'
import { Config, type Config as EdgeConfig } from './config.js'
import { connectEdge, type EdgeRuntime } from './connection.js'

export const name = 'browser-use-edge'
export const inject = ['browserUse']
export { Config, connectEdge }

export class EdgeBrowserUseBackend implements BrowserUseBackend {
  readonly browserType = 'edge'
  private catalog: BrowserUseTool[] = []
  private readonly sessions = new Map<object, EdgeRuntime>()
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  private closing?: Promise<void>
  private settings: BrowserUseSettings = { browserType: 'edge', browserPath: '', headless: false }

  constructor(private readonly connect = connectEdge, private readonly onError: (error: unknown) => void = () => {}, private readonly config: EdgeConfig = { toolCallTimeoutMs: 120_000 }) {}

  async initialize(): Promise<void> {
    const runtime = await this.connect(this.settings, {})
    try {
      let cursor: string | undefined
      do {
        const result = await runtime.client.listTools({ cursor })
        this.catalog.push(...result.tools.map(tool => ({ name: tool.name, description: tool.description ?? '', parameters: tool.inputSchema })))
        cursor = result.nextCursor
      } while (cursor)
    } finally { await runtime.close() }
  }

  tools(): readonly BrowserUseTool[] { return this.catalog }

  execute(owner: object, toolName: string, args: Record<string, unknown>): Promise<BrowserUseResult> {
    if (this.disposed) return Promise.reject(new Error('Edge browser-use backend is disposed'))
    return this.enqueue(async () => {
      if (!this.catalog.some(tool => tool.name === toolName)) throw new Error(`unknown Edge tool '${toolName}'`)
      let runtime = this.sessions.get(owner)
      if (!runtime) {
        runtime = await this.connect(this.settings, owner)
        this.sessions.set(owner, runtime)
      }
      const result = await runtime.client.callTool({ name: toolName, arguments: args }, undefined, { timeout: this.config.toolCallTimeoutMs })
      const content = (result.content ?? []) as BrowserUseResult['content']
      if (result.isError) {
        const message = content.flatMap(item => item && typeof item === 'object' && !Array.isArray(item) && item.type === 'text' ? [String(item.text)] : []).join('\n')
        throw new Error(message || `${toolName} failed`)
      }
      return { content, ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent as BrowserUseResult['structuredContent'] }) }
    })
  }

  release(owner: object): void {
    void this.enqueue(async () => {
      const runtime = this.sessions.get(owner)
      this.sessions.delete(owner)
      await runtime?.close()
    }).catch(this.onError)
  }

  reconfigure(settings: BrowserUseSettings): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Edge browser-use backend is disposed'))
    const next = { ...settings }
    return this.enqueue(async () => {
      if (next.browserType !== 'edge') throw new Error('Edge backend requires browserType: edge; switch the Domain backend and browserType together')
      if (next.headless === this.settings.headless && next.browserPath === this.settings.browserPath) return
      this.settings = next
      await this.reset()
    })
  }

  close(): Promise<void> {
    this.disposed = true
    return this.closing ??= this.enqueue(() => this.reset())
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
    if (errors.length) throw new AggregateError(errors, 'Failed to close Edge MCP sessions')
  }
}

export async function apply(ctx: Context, config: EdgeConfig): Promise<void> {
  const backend = new EdgeBrowserUseBackend(connectEdge, error => ctx.logger.warn(String(error)), config)
  ctx.effect(() => () => backend.close())
  await backend.initialize()
  ctx.effect(() => ctx.browserUse.backend.register('edge', backend))
  ctx.provide(browserUseBackendServiceKey('edge'), backend)
}
