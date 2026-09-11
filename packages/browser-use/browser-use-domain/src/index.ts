import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { browserUseBackendServiceKey, discoverBrowserExecutable, type BrowserUseBackend, type BrowserUseSettings } from 'browser-use'
import { BackendSwitcher } from './backend-switcher.ts'
import { registerBrowserPicker } from './browser-picker.ts'
import { Config, SETTINGS_NAMESPACE, SettingsSchema, type Config as DomainConfig } from './config.ts'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'browser-use-domain'
export const inject = ['browserUse', 'tools']
export { Config, SETTINGS_NAMESPACE }

function textOf(content: JsonValue[]): string {
  return content.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const value = item as Record<string, JsonValue>
    return value.type === 'text' && typeof value.text === 'string' ? [value.text] : []
  }).join('\n')
}

function requireAgent(exec: ToolRunContext): Agent {
  if (!exec.agent) throw new Error('browser-use tools require an initiating DSH session')
  return exec.agent
}

function definition(backend: BrowserUseBackend, tool: ReturnType<BrowserUseBackend['tools']>[number], timeoutMs: number, execute: BrowserUseBackend['execute']): ToolDefinition {
  return {
    name: `mcp__${backend.browserType}__${tool.name}`,
    description: tool.description,
    parameters: tool.parameters,
    output: {
      schema: { type: 'object', properties: { content: { type: 'array', items: {} }, structuredContent: {} }, required: ['content'], additionalProperties: false },
      render(_args, value) {
        const result = value as unknown as { content: JsonValue[] }
        return [{ type: 'text', text: textOf(result.content) || '(no textual output)' }]
      },
    },
    timeoutMs,
    async execute(args, exec) {
      return execute(requireAgent(exec), tool.name, (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>)
    },
  }
}

export function apply(ctx: Context, config: DomainConfig): void {
  const base: BrowserUseSettings = { headless: config.headless, browserType: config.browserType, browserPath: config.browserPath.trim() }
  const report = (error: unknown) => ctx.logger.warn('browser-use: ' + String(error))
  const switcher = new BackendSwitcher(base,
    settings => settings.browserType === config.browserType ? config.backend : settings.browserType,
    (backend, tool, execute) => ctx.tools.register(definition(backend, tool, config.toolCallTimeoutMs, execute)),
  )
  ctx.effect(() => () => switcher.close())
  registerBrowserPicker(ctx)
  ctx.on('agent/disposed', ({ agent }) => { void switcher.release(agent).catch(report) }, { global: true })

  for (const name of new Set([config.backend, 'chrome', 'edge'])) {
    ctx.inject([browserUseBackendServiceKey(name)], backendCtx => {
      const backend = backendCtx.browserUse.backend.get(name)
      backendCtx.effect(() => {
        void switcher.attach(name, backend).catch(report)
        return () => switcher.detach(name, backend).catch(report)
      })
    })
  }

  ctx.inject(['settings'], settingsCtx => {
    const scope = settingsCtx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base })
    let tail: Promise<unknown> = Promise.resolve()
    const applySettings = (next: BrowserUseSettings): Promise<void> => {
      const pending = tail.then(async () => {
        const settings = { ...next }
        if (!settings.browserPath.trim()) settings.browserPath = await discoverBrowserExecutable(settings.browserType) ?? ''
        await switcher.configure(settings)
      })
      tail = pending.catch(() => {})
      return pending
    }
    void applySettings(scope.get()).catch(report)
    settingsCtx.effect(() => scope.watch(next => applySettings(next)), 'browser-use: settings watcher')
  })
}
