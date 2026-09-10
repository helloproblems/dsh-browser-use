/** Browser settings decoded from Remote JSON replies. */

/** Browser implementations accepted by the settings editor. */
export type BrowserType = 'chrome' | 'edge'

/** Editable browser connection settings. */
export type SettingsValue = { headless: boolean; browserType: BrowserType; browserPath: string }

/**
 * Decode one browser settings value returned over Remote.
 * @param value - Untrusted namespace value.
 * @returns Validated settings for the editor.
 * @throws When required settings are missing or have invalid types.
 */
export function readSettings(value: unknown): SettingsValue {
  if (typeof value !== 'object' || value === null || !('headless' in value) || typeof value.headless !== 'boolean'
    || !('browserType' in value) || (value.browserType !== 'chrome' && value.browserType !== 'edge')
    || !('browserPath' in value) || typeof value.browserPath !== 'string') {
    throw new Error('浏览器自动化设置格式无效')
  }
  return { headless: value.headless, browserType: value.browserType, browserPath: value.browserPath }
}

