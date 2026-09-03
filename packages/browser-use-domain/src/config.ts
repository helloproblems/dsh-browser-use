import z from '@deepseek-ai/schemastery'
import type { BrowserUseSettings } from 'browser-use'

export interface Config extends BrowserUseSettings {
  backend: string
  toolCallTimeoutMs: number
}

export const DEFAULT_SETTINGS: BrowserUseSettings = {
  headless: false,
  browserType: 'chrome',
  browserUrl: '',
  autoDiscover: true,
}

export const SETTINGS_NAMESPACE = 'browser-use'

export const Config: z<Config> = z.object({
  backend: z.string().default('chrome'),
  headless: z.boolean().default(DEFAULT_SETTINGS.headless),
  browserType: z.const('chrome').default(DEFAULT_SETTINGS.browserType),
  browserUrl: z.string().default(DEFAULT_SETTINGS.browserUrl),
  autoDiscover: z.boolean().default(DEFAULT_SETTINGS.autoDiscover),
  toolCallTimeoutMs: z.number().min(1).default(120_000),
})

export const SettingsSchema: z<BrowserUseSettings> = z.object({
  headless: z.boolean().default(false).description('Run the selected browser without a visible window'),
  browserType: z.const('chrome').default('chrome').description('Chrome'),
  browserUrl: z.string().default('').description('Remote debugging HTTP address'),
  autoDiscover: z.boolean().default(true).description('Automatically discover a debug-enabled browser'),
})

