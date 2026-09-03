import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export interface BrowserUseSettings {
  headless: boolean
  browserType: 'chrome'
  browserUrl: string
  autoDiscover: boolean
}

export interface BrowserUseTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface BrowserUseResult {
  content: JsonValue[]
  structuredContent?: JsonValue
}

export interface BrowserUseBackend {
  readonly browserType: string
  tools(): readonly BrowserUseTool[]
  execute(owner: object, toolName: string, args: Record<string, unknown>): Promise<BrowserUseResult>
  release(owner: object): void
  reconfigure(settings: BrowserUseSettings): Promise<void>
  close(): Promise<void>
}

