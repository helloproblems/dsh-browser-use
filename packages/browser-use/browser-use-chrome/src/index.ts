import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { browserUseBackendServiceKey, type BrowserUseBackend, type BrowserUseResult, type BrowserUseSettings, type BrowserUseTool } from 'browser-use'
import { closeBrowser, ensureBrowserLaunched } from 'chrome-devtools-mcp/build/src/browser.js'
import { McpContext } from 'chrome-devtools-mcp/build/src/McpContext.js'
import { ToolHandler } from 'chrome-devtools-mcp/build/src/ToolHandler.js'
import { createTools } from 'chrome-devtools-mcp/build/src/tools/tools.js'
import { Mutex } from 'chrome-devtools-mcp/build/src/third_party/index.js'
import { Config, type Config as ChromeConfig } from './config.js'
import { zodInputToJsonSchema } from './json-schema.js'

export const name = 'browser-use-chrome'
export const inject = ['browserUse']
export { Config, zodInputToJsonSchema }

interface OwnerLike { id?: unknown; session?: { header?: { cwd?: string } } }
interface SessionRuntime { context: McpContext; handlers: Map<string, ToolHandler> }
const serverArgs: Record<string, unknown> = { usageStatistics: false, performanceCrux: false, pageIdRouting: false, slim: false, isolated: true, allowUnrestrictedPaths: false, categoryExtensions: false, experimentalDevtools: false, experimentalIncludeAllPages: false, redactNetworkHeaders: true }

function textOf(content: BrowserUseResult['content']): string {
  return content.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const value = item as Record<string, unknown>
    return value.type === 'text' && typeof value.text === 'string' ? [value.text] : []
  }).join('\n')
}

export class ChromeBrowserUseBackend implements BrowserUseBackend {
  readonly browserType = 'chrome'
  private browserPromise: Promise<any> | undefined
  private readonly sessions = new Map<object, Promise<SessionRuntime>>()
  private readonly mutex = new Mutex()
  private readonly rawTools = new Map<string, any>()
  private readonly catalog: BrowserUseTool[]
  private disposed = false

  constructor(private settings: () => BrowserUseSettings, private readonly logger: Context['logger'], private readonly config: ChromeConfig) {
    this.catalog = createTools(serverArgs).flatMap((tool) => {
      const handler = new ToolHandler(tool, serverArgs, async () => undefined, new Mutex())
      if (!handler.shouldRegister) return []
      this.rawTools.set(tool.name, tool)
      return [{ name: tool.name, description: tool.description ?? '', parameters: zodInputToJsonSchema(handler.registeredInputSchema) }]
    })
  }

  tools(): readonly BrowserUseTool[] { return this.catalog }

  async execute(owner: object, toolName: string, args: Record<string, unknown>): Promise<BrowserUseResult> {
    if (this.disposed) throw new Error('Chrome browser-use backend is disposed')
    const tool = this.rawTools.get(toolName)
    if (!tool) throw new Error(`unknown Chrome tool '${toolName}'`)
    const runtime = await this.runtimeFor(owner)
    let handler = runtime.handlers.get(toolName)
    if (!handler) { handler = new ToolHandler(tool, serverArgs, async () => runtime.context, this.mutex); runtime.handlers.set(toolName, handler) }
    const result = await handler.handle({ ...args })
    const content = Array.isArray(result.content) ? result.content as BrowserUseResult['content'] : []
    if (result.isError) throw new Error(textOf(content) || `${toolName} failed`)
    return { content, ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent as BrowserUseResult['structuredContent'] }) }
  }

  release(owner: object): void { const pending = this.sessions.get(owner); this.sessions.delete(owner); void pending?.then(runtime => runtime.context.dispose(), () => undefined) }
  async reconfigure(settings: BrowserUseSettings): Promise<void> { this.settings = () => settings; await this.resetBrowser() }
  async close(): Promise<void> { if (this.disposed) return; this.disposed = true; await this.resetBrowser() }

  private runtimeFor(owner: object): Promise<SessionRuntime> {
    let runtime = this.sessions.get(owner)
    if (!runtime) { runtime = this.createRuntime(owner as OwnerLike); this.sessions.set(owner, runtime); void runtime.catch(() => { if (this.sessions.get(owner) === runtime) this.sessions.delete(owner) }) }
    return runtime
  }

  private async createRuntime(owner: OwnerLike): Promise<SessionRuntime> {
    const browser = await this.browser()
    const context = await McpContext.from(browser, (...args: unknown[]) => this.logger.debug(args.map(String).join(' ')), { performanceCrux: false, allowUnrestrictedPaths: false })
    const cwd = owner.session?.header?.cwd
    if (cwd) (context as any).setRoots([{ uri: pathToFileURL(cwd).href, name: 'workspace' }])
    await (context as any).newPage(false, `browser-use-${String(owner.id ?? 'session')}`)
    return { context, handlers: new Map() }
  }

  private browser(): Promise<any> { this.browserPromise ??= this.openBrowser(); void this.browserPromise.catch(() => { this.browserPromise = undefined }); return this.browserPromise }
  private async openBrowser(): Promise<any> {
    const settings = this.settings()
    const executablePath = settings.browserPath.trim() || undefined
    const target = executablePath ?? 'the system Chrome installation'
    this.logger.info(`browser-use-chrome: launching ${target} (headless=${String(settings.headless)})`)
    return ensureBrowserLaunched({
      headless: settings.headless,
      channel: executablePath ? undefined : 'stable',
      executablePath,
      isolated: false,
      viaCli: false,
      chromeArgs: [],
      ignoreDefaultChromeArgs: [],
    })
  }
  private async resetBrowser(): Promise<void> {
    const pending = [...this.sessions.values()]; this.sessions.clear()
    for (const runtime of await Promise.allSettled(pending)) if (runtime.status === 'fulfilled') runtime.value.context.dispose()
    this.browserPromise = undefined; await closeBrowser()
  }
}

export function apply(ctx: Context, config: ChromeConfig): void {
  const fallback: BrowserUseSettings = { headless: false, browserType: 'chrome', browserPath: '' }
  const backend = new ChromeBrowserUseBackend(() => fallback, ctx.logger, config)
  ctx.effect(() => { const unregister = ctx.browserUse.backend.register('chrome', backend); return async () => { unregister(); await backend.close() } })
  ctx.provide(browserUseBackendServiceKey('chrome'), backend)
}
