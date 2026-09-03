import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export type BrowserType = 'chrome' | 'edge'

export interface BrowserExecutableDiscoveryOptions {
  platformName?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
  candidates?: readonly string[]
  accessImpl?: (path: string, mode?: number) => Promise<void>
}

function envValue(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]
    if (value) return value
  }
  return undefined
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(Boolean))]
}

function windowsCandidates(browserType: BrowserType, env: NodeJS.ProcessEnv, home: string): string[] {
  const systemDrive = envValue(env, 'SystemDrive', 'SYSTEMDRIVE') ?? 'C:'
  const localAppData = envValue(env, 'LOCALAPPDATA') ?? join(home, 'AppData', 'Local')
  const programFiles = envValue(env, 'ProgramFiles', 'PROGRAMFILES') ?? join(systemDrive, 'Program Files')
  const programFilesX86 = envValue(env, 'ProgramFiles(x86)', 'PROGRAMFILES(X86)') ?? join(systemDrive, 'Program Files (x86)')
  if (browserType === 'edge') {
    return unique([
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ])
  }
  return unique([
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ])
}

function darwinCandidates(browserType: BrowserType, home: string): string[] {
  const appName = browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome'
  return [
    join('/Applications', `${appName}.app`, 'Contents', 'MacOS', appName),
    join(home, 'Applications', `${appName}.app`, 'Contents', 'MacOS', appName),
  ]
}

function linuxCandidates(browserType: BrowserType, env: NodeJS.ProcessEnv): string[] {
  const commands = browserType === 'edge'
    ? ['microsoft-edge-stable', 'microsoft-edge', 'microsoft-edge-beta', 'microsoft-edge-dev']
    : ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']
  const pathEntries = (env.PATH ?? '').split(':').filter(Boolean)
  return unique([
    ...commands.map(command => join('/usr/bin', command)),
    ...commands.map(command => join('/usr/local/bin', command)),
    ...commands.map(command => join('/snap/bin', command)),
    ...pathEntries.flatMap(entry => commands.map(command => join(entry, command))),
  ])
}

export function browserExecutableCandidates(
  browserType: BrowserType,
  options: Omit<BrowserExecutableDiscoveryOptions, 'candidates' | 'accessImpl'> = {},
): string[] {
  const platformName = options.platformName ?? platform()
  const env = options.env ?? process.env
  const home = options.homeDir ?? homedir()
  if (platformName === 'win32') return windowsCandidates(browserType, env, home)
  if (platformName === 'darwin') return darwinCandidates(browserType, home)
  return linuxCandidates(browserType, env)
}

export async function discoverBrowserExecutable(
  browserType: BrowserType,
  options: BrowserExecutableDiscoveryOptions = {},
): Promise<string | undefined> {
  const candidates = options.candidates ?? browserExecutableCandidates(browserType, options)
  const accessImpl = options.accessImpl ?? access
  for (const candidate of candidates) {
    try {
      await accessImpl(candidate, constants.X_OK)
      return candidate
    } catch {}
  }
  return undefined
}
