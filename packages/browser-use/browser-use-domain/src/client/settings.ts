/** Browser settings decoded from Remote JSON replies. */
import { copy, SettingsError } from './copy.ts'

/** Browser implementations accepted by the settings editor. */
export type BrowserType = 'chrome' | 'edge'

/** Editable browser connection settings. */
export type SettingsValue = { headless: boolean; browserType: BrowserType; browserPath: string; userDataDir?: string; sessionIsolation?: boolean }

/** Accept absolute Windows/UNC and POSIX paths entered for the host. */
export function userDataDirError(value: string | undefined, locale = 'zh'): string {
  const path = value?.trim() ?? ''
  return !path || /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/i.test(path)
    ? '' : copy(locale, 'absoluteDirectory')
}

/** Validate the executable name without changing the selected type or path. */
export function browserPathError({ browserType, browserPath }: SettingsValue, locale = 'zh'): string {
  if (!browserPath.trim()) return ''
  const filename = browserPath.trim().replace(/\\/g, '/').split('/').pop()?.toLowerCase()
  const detectedType = /^(msedge(?:\.exe)?|microsoft-edge(?:-stable|-beta|-dev)?|microsoft edge(?:\.app)?)$/.test(filename ?? '')
    ? 'edge'
    : /^(chrome(?:\.exe)?|google-chrome(?:-stable|-beta|-unstable)?|google chrome(?:\.app)?)$/.test(filename ?? '')
      ? 'chrome'
      : undefined
  const expected = browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome'
  if (!detectedType) return copy(locale, 'unknownBrowser', { browser: expected })
  if (detectedType !== browserType) return copy(locale, 'mismatchedBrowser', { browser: expected })
  return ''
}

/**
 * Decode one browser settings value returned over Remote.
 * @param value - Untrusted namespace value.
 * @returns Validated settings for the editor.
 * @throws When required settings are missing or have invalid types.
 */
export function readSettings(value: unknown): SettingsValue {
  if (typeof value !== 'object' || value === null || !('headless' in value) || typeof value.headless !== 'boolean'
    || !('browserType' in value) || (value.browserType !== 'chrome' && value.browserType !== 'edge')
    || !('browserPath' in value) || typeof value.browserPath !== 'string'
    || ('userDataDir' in value && typeof value.userDataDir !== 'string')
    || ('sessionIsolation' in value && typeof value.sessionIsolation !== 'boolean')) {
    throw new SettingsError('invalidSettings')
  }
  return { headless: value.headless, browserType: value.browserType, browserPath: value.browserPath,
    userDataDir: 'userDataDir' in value ? value.userDataDir as string : '',
    sessionIsolation: 'sessionIsolation' in value ? value.sessionIsolation as boolean : false }
}
