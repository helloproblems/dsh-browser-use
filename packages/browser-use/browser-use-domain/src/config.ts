import z from '@deepseek-ai/schemastery'
import type { BrowserUseSettings } from 'browser-use'

export interface Config extends BrowserUseSettings {
  backend: string
  toolCallTimeoutMs: number
}

export const DEFAULT_SETTINGS: BrowserUseSettings = {
  headless: false,
  browserType: 'chrome',
  browserPath: '',
  userDataDir: '',
  sessionIsolation: false,
}

export const SETTINGS_NAMESPACE = 'browser-use'

export const Config: z<Config> = z.object({
  backend: z.string().default('chrome'),
  headless: z.boolean().default(DEFAULT_SETTINGS.headless),
  browserType: z.union([z.const('chrome'), z.const('edge')]).default(DEFAULT_SETTINGS.browserType),
  browserPath: z.string().default(DEFAULT_SETTINGS.browserPath),
  userDataDir: z.string().default(''),
  sessionIsolation: z.boolean().default(false),
  toolCallTimeoutMs: z.number().min(1).default(120_000),
})

export const SettingsSchema: z<BrowserUseSettings> = z.object({
  headless: z.boolean().default(false).description('Run the selected browser without a visible window'),
  browserType: z.union([z.const('chrome'), z.const('edge')]).default('chrome').description('Browser type'),
  browserPath: z.string().default('').description('Absolute path of the browser executable'),
  userDataDir: z.string().default('').description('Persistent browser user data directory; empty uses isolated sessions'),
  sessionIsolation: z.boolean().default(false).description('Use a separate persistent profile subdirectory for each session'),
})
