import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { platform } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { discoverBrowserExecutable, type BrowserType } from 'browser-use'
import { WINDOWS_PICKER_SCRIPT } from './windows-picker-script.ts'

export const BROWSER_PICKER_ENDPOINT = '/browser-use/pick-browser-executable'
export const USER_DATA_PICKER_ENDPOINT = '/browser-use/pick-user-data-directory'
export const BROWSER_PICKER_HEADER = 'x-dsh-browser-use-picker'

interface WebRouteLike {
  kind: 'exact'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register(route: WebRouteLike): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServerLike
  }
}

interface CommandResult { stdout: string; stderr: string }
interface CommandFailure extends Error { code?: string | number; stdout?: string; stderr?: string }
type CommandRunner = (command: string, args: readonly string[], signal: AbortSignal, env?: NodeJS.ProcessEnv) => Promise<CommandResult>

export interface BrowserPickerOptions {
  platformName?: NodeJS.Platform
  initialPath?: string
  locale?: string
  run?: CommandRunner
}

function runCommand(command: string, args: readonly string[], signal: AbortSignal, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], {
      encoding: 'utf8',
      env: env ?? process.env,
      signal,
      windowsHide: true,
      timeout: 120_000,
    }, (error, stdout, stderr) => {
      if (error) {
        const failure = error as CommandFailure
        failure.stdout = String(stdout)
        failure.stderr = String(stderr)
        reject(failure)
        return
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function commandMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'ENOENT'
}

function chooserCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = Reflect.get(error, 'code')
  return code === 1 || code === '1'
}

function outputPath(result: CommandResult): string | null {
  const value = result.stdout.replace(/^\uFEFF/, '').trim()
  return value === '' ? null : value
}

async function pickOnWindows(initialPath: string | undefined, signal: AbortSignal, run: CommandRunner, directory = false, locale?: string): Promise<string | null> {
  const env = { ...process.env, DSH_BROWSER_PICKER_INITIAL: initialPath ?? '', DSH_BROWSER_PICKER_DIRECTORY: directory ? '1' : '0', DSH_BROWSER_PICKER_LOCALE: locale ?? '' }
  let missing: unknown
  for (const command of ['powershell.exe', 'pwsh.exe', 'pwsh']) {
    try {
      return outputPath(await run(command, ['-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_PICKER_SCRIPT], signal, env))
    } catch (error: unknown) {
      if (!commandMissing(error)) throw error
      missing = error
    }
  }
  throw missing ?? new Error('no PowerShell executable is available for the browser picker')
}

async function pickOnDarwin(signal: AbortSignal, run: CommandRunner, directory = false): Promise<string | null> {
  try {
    return outputPath(await run('osascript', [
      '-e',
      directory ? 'POSIX path of (choose folder with prompt "Select browser user data directory")' : 'POSIX path of (choose file with prompt "Select browser executable")',
    ], signal))
  } catch (error: unknown) {
    if (!signal.aborted && chooserCancelled(error)) return null
    throw error
  }
}

async function pickOnLinux(initialPath: string | undefined, signal: AbortSignal, run: CommandRunner, directory = false): Promise<string | null> {
  try {
    const args = ['--file-selection', directory ? '--title=Select browser user data directory' : '--title=Select browser executable']
    if (directory) args.push('--directory')
    if (initialPath) args.push(`--filename=${initialPath}`)
    return outputPath(await run('zenity', args, signal))
  } catch (error: unknown) {
    if (!signal.aborted && chooserCancelled(error)) return null
    if (!commandMissing(error)) throw error
  }
  try {
    return outputPath(await run('kdialog', [directory ? '--getexistingdirectory' : '--getopenfilename', initialPath ?? ''], signal))
  } catch (error: unknown) {
    if (!signal.aborted && chooserCancelled(error)) return null
    if (commandMissing(error)) throw new Error('no supported browser file picker is available (install zenity or kdialog)')
    throw error
  }
}

async function normalizePickedPath(path: string, browserType: BrowserType, platformName: NodeJS.Platform): Promise<string> {
  if (!isAbsolute(path)) throw new Error('browser picker returned a non-absolute path')
  const entry = await stat(path)
  if (entry.isFile()) {
    await access(path, constants.X_OK)
    return path
  }
  if (platformName === 'darwin' && entry.isDirectory() && path.endsWith('.app')) {
    const executableName = browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome'
    const executable = join(path, 'Contents', 'MacOS', executableName)
    await access(executable, constants.X_OK)
    return executable
  }
  throw new Error('selected path is not a browser executable file')
}

/** Shared OS dialog lifecycle; callers validate the selected file or directory. */
async function pickNativePath(kind: 'file' | 'directory', signal: AbortSignal, options: BrowserPickerOptions): Promise<string | null> {
  signal.throwIfAborted()
  const platformName = options.platformName ?? platform()
  const run = options.run ?? runCommand
  const directory = kind === 'directory'
  if (platformName === 'win32') return pickOnWindows(options.initialPath, signal, run, directory, options.locale)
  if (platformName === 'darwin') return pickOnDarwin(signal, run, directory)
  return pickOnLinux(options.initialPath, signal, run, directory)
}

export async function pickBrowserExecutable(
  browserType: BrowserType,
  signal: AbortSignal,
  options: BrowserPickerOptions = {},
): Promise<string | null> {
  const platformName = options.platformName ?? platform()
  const initialPath = options.initialPath ?? await discoverBrowserExecutable(browserType)
  const selected = await pickNativePath('file', signal, { ...options, ...(initialPath ? { initialPath } : {}) })
  return selected === null ? null : normalizePickedPath(selected, browserType, platformName)
}

/** Select an existing directory on the DSH host, preserving cancellation. */
export async function pickUserDataDirectory(signal: AbortSignal, options: BrowserPickerOptions = {}): Promise<string | null> {
  const selected = await pickNativePath('directory', signal, options)
  return validateDirectory(selected)
}

async function validateDirectory(selected: unknown): Promise<string | null> {
  if (selected === null) return null
  if (typeof selected !== 'string' || !isAbsolute(selected)) throw new Error('directory picker returned a non-absolute path')
  if (!(await stat(selected)).isDirectory()) throw new Error('selected path is not a directory')
  return selected
}

/** Reuse Add Workspace's composed picker; older hosts can use our native adapter. */
export async function pickHostUserDataDirectory(service: unknown, signal: AbortSignal, options: BrowserPickerOptions = {}): Promise<string | null> {
  signal.throwIfAborted()
  if (service == null) return pickUserDataDirectory(signal, options)
  if (typeof service !== 'object' || !('capability' in service) || typeof service.capability !== 'function') throw new Error('DSH directory picker is unavailable')
  const capability: unknown = service.capability()
  if (typeof capability !== 'object' || capability === null || !('kind' in capability) || capability.kind !== 'native'
    || !('pick' in capability) || typeof capability.pick !== 'function') throw new Error('DSH is not configured with a native directory picker')
  const selected: unknown = await capability.pick(signal)
  signal.throwIfAborted()
  return validateDirectory(selected)
}

/** Use the same DSH directory picker to locate a browser inside its installation directory. */
export async function pickHostBrowserExecutable(service: unknown, browserType: BrowserType, signal: AbortSignal, options: BrowserPickerOptions = {}): Promise<string | null> {
  if (service == null) return pickBrowserExecutable(browserType, signal, options)
  const directory = await pickHostUserDataDirectory(service, signal, options)
  if (directory === null) return null
  const platformName = options.platformName ?? platform()
  const name = browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome'
  const executable = browserType === 'edge' ? 'msedge.exe' : 'chrome.exe'
  const relativePaths = platformName === 'win32'
    ? [executable, join('Application', executable)]
    : platformName === 'darwin'
      ? [join('Contents', 'MacOS', name), join(`${name}.app`, 'Contents', 'MacOS', name), name]
      : browserType === 'edge'
        ? ['microsoft-edge', 'microsoft-edge-stable', 'microsoft-edge-beta', 'microsoft-edge-dev', 'msedge']
        : ['google-chrome', 'google-chrome-stable', 'google-chrome-beta', 'google-chrome-unstable', 'chrome']
  const found = await discoverBrowserExecutable(browserType, {
    candidates: relativePaths.map(path => join(directory, path)),
    accessImpl: async (path, mode) => {
      if (!(await stat(path)).isFile()) throw new Error('not an executable file')
      await access(path, mode)
    },
  })
  signal.throwIfAborted()
  if (!found) throw new Error(`所选目录中未找到 ${name} 可执行文件，请选择浏览器安装目录，或手动填写可执行文件路径。`)
  return found
}

export function isSameOriginPickerRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  const host = request.headers.host
  if (!origin || !host || request.headers[BROWSER_PICKER_HEADER] !== '1') return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function respondJson(response: ServerResponse, status: number, value: object): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

function pickerHandler(request: IncomingMessage, response: ServerResponse, directory = false, directoryPickerService?: unknown): Promise<void> | void {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST')
    respondJson(response, 405, { error: 'method not allowed' })
    return
  }
  if (!isSameOriginPickerRequest(request)) {
    respondJson(response, 403, { error: 'browser picker request must be same-origin' })
    return
  }
  const url = new URL(request.url ?? BROWSER_PICKER_ENDPOINT, 'http://localhost')
  const browserType: BrowserType = url.searchParams.get('browserType') === 'edge' ? 'edge' : 'chrome'
  const initialPath = url.searchParams.get('initialPath')?.trim() || undefined
  const locale = url.searchParams.get('locale')?.trim() || undefined
  if (locale && (locale.length > 85 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale))) {
    respondJson(response, 400, { error: 'invalid picker locale' })
    return
  }
  if (initialPath && !isAbsolute(initialPath)) {
    respondJson(response, 400, { error: 'browser picker initial path must be absolute' })
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => { controller.abort(new Error('选择窗口等待超时，请重试。')) }, 120_000)
  const abort = (): void => { controller.abort() }
  const close = (): void => { if (!response.writableEnded) controller.abort() }
  request.once('aborted', abort)
  response.once('close', close)
  const options: BrowserPickerOptions = { ...(initialPath ? { initialPath } : {}), ...(locale ? { locale } : {}) }
  const picked = directory
    ? pickHostUserDataDirectory(directoryPickerService, controller.signal, options)
    : pickHostBrowserExecutable(directoryPickerService, browserType, controller.signal, options)
  return picked.then(
    path => { if (!response.destroyed) respondJson(response, 200, { path }) },
    (error: unknown) => {
      if (response.destroyed) return
      const message = error instanceof Error ? error.message : String(error)
      respondJson(response, 500, { error: message })
    },
  ).finally(() => {
    clearTimeout(timeout)
    request.off('aborted', abort)
    response.off('close', close)
  })
}

export function registerBrowserPicker(ctx: Context): void {
  ctx.inject(['webServer'], webCtx => {
    for (const [path, directory] of [[BROWSER_PICKER_ENDPOINT, false], [USER_DATA_PICKER_ENDPOINT, true]] as const) {
      webCtx.effect(
        () => webCtx.webServer.register({ kind: 'exact', path, handler: (request, response) => pickerHandler(request, response, directory,
          webCtx.get('directoryPicker', false)) }),
        `browser-use: ${path}`,
      )
    }
  })
}
