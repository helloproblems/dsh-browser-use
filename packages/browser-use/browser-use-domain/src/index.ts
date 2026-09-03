import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { browserUseBackendServiceKey, discoverBrowserExecutable, type BrowserUseBackend, type BrowserUseSettings } from 'browser-use'
import { registerBrowserPicker } from './browser-picker.js'
import { Config, SETTINGS_NAMESPACE, SettingsSchema, type Config as DomainConfig } from './config.js'
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

function definition(backend: BrowserUseBackend, tool: ReturnType<BrowserUseBackend['tools']>[number], timeoutMs: number): ToolDefinition {
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
      return backend.execute(requireAgent(exec), tool.name, (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>)
    },
  }
}

export function apply(ctx: Context, config: DomainConfig): Promise<void> {
  const backendService = browserUseBackendServiceKey(config.backend)
  const fiber = ctx.inject([backendService], async (domainCtx) => {
    const backend = domainCtx.browserUse.backend.get(config.backend)
    const configuredPath = config.browserPath.trim()
    const detectedPath = configuredPath === ''
      ? await discoverBrowserExecutable(config.browserType)
      : undefined
    let current: BrowserUseSettings = {
      headless: config.headless,
      browserType: config.browserType,
      browserPath: configuredPath || detectedPath || '',
    }
    await backend.reconfigure(current).catch(error => domainCtx.logger.warn(`browser-use: initial configuration failed: ${String(error)}`))
    registerBrowserPicker(domainCtx)

    domainCtx.on('agent/disposed', ({ agent }) => { backend.release(agent) }, { global: true })
    for (const tool of backend.tools()) domainCtx.tools.register(definition(backend, tool, config.toolCallTimeoutMs))

    domainCtx.inject(['settings'], settingsCtx => {
      const scope = settingsCtx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: current })
      const descriptor = settingsCtx.settings.describe().find(item => item.ns === SETTINGS_NAMESPACE)
      const user = descriptor?.user as Record<string, unknown> | undefined
      const storedPath = typeof user?.browserPath === 'string' ? user.browserPath.trim() : ''
      current = scope.get()
      void backend.reconfigure(current).catch(error => domainCtx.logger.warn(`browser-use: settings configuration failed: ${String(error)}`))
      settingsCtx.effect(() => scope.watch((next) => {
        current = next
        void backend.reconfigure(next).catch(error => domainCtx.logger.warn(`browser-use: reconfigure failed: ${String(error)}`))
      }), 'browser-use: settings watcher')
      if (detectedPath && storedPath === '') {
        void scope.update({ browserPath: detectedPath }).catch(error => domainCtx.logger.warn(`browser-use: could not persist detected browser path: ${String(error)}`))
      }
    })
  })
  return Promise.resolve(fiber).then(() => {})
}

