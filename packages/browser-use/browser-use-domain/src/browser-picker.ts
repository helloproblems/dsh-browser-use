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
  run?: CommandRunner
}

function runCommand(command: string, args: readonly string[], signal: AbortSignal, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], {
      encoding: 'utf8',
      env: env ?? process.env,
      signal,
      windowsHide: true,
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

async function pickOnWindows(initialPath: string | undefined, signal: AbortSignal, run: CommandRunner): Promise<string | null> {
  const env = { ...process.env, DSH_BROWSER_PICKER_INITIAL: initialPath ?? '' }
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

async function pickOnDarwin(signal: AbortSignal, run: CommandRunner): Promise<string | null> {
  try {
    return outputPath(await run('osascript', [
      '-e',
      'POSIX path of (choose file with prompt "Select browser executable")',
    ], signal))
  } catch (error: unknown) {
    if (chooserCancelled(error)) return null
    throw error
  }
}

async function pickOnLinux(initialPath: string | undefined, signal: AbortSignal, run: CommandRunner): Promise<string | null> {
  try {
    const args = ['--file-selection', '--title=Select browser executable']
    if (initialPath) args.push(`--filename=${initialPath}`)
    return outputPath(await run('zenity', args, signal))
  } catch (error: unknown) {
    if (chooserCancelled(error)) return null
    if (!commandMissing(error)) throw error
  }
  try {
    return outputPath(await run('kdialog', ['--getopenfilename', initialPath ?? ''], signal))
  } catch (error: unknown) {
    if (chooserCancelled(error)) return null
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

export async function pickBrowserExecutable(
  browserType: BrowserType,
  signal: AbortSignal,
  options: BrowserPickerOptions = {},
): Promise<string | null> {
  const platformName = options.platformName ?? platform()
  const run = options.run ?? runCommand
  const initialPath = options.initialPath ?? await discoverBrowserExecutable(browserType)
  const selected = platformName === 'win32'
    ? await pickOnWindows(initialPath, signal, run)
    : platformName === 'darwin'
      ? await pickOnDarwin(signal, run)
      : await pickOnLinux(initialPath, signal, run)
  return selected === null ? null : normalizePickedPath(selected, browserType, platformName)
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

function pickerHandler(request: IncomingMessage, response: ServerResponse): Promise<void> | void {
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
  if (initialPath && !isAbsolute(initialPath)) {
    respondJson(response, 400, { error: 'browser picker initial path must be absolute' })
    return
  }
  const controller = new AbortController()
  const abort = (): void => { controller.abort() }
  const close = (): void => { if (!response.writableEnded) controller.abort() }
  request.once('aborted', abort)
  response.once('close', close)
  return pickBrowserExecutable(browserType, controller.signal, initialPath ? { initialPath } : {}).then(
    path => { if (!response.destroyed) respondJson(response, 200, { path }) },
    (error: unknown) => {
      if (response.destroyed) return
      const message = error instanceof Error ? error.message : String(error)
      respondJson(response, 500, { error: message })
    },
  ).finally(() => {
    request.off('aborted', abort)
    response.off('close', close)
  })
}

export function registerBrowserPicker(ctx: Context): void {
  ctx.inject(['webServer'], webCtx => webCtx.effect(
    () => webCtx.webServer.register({ kind: 'exact', path: BROWSER_PICKER_ENDPOINT, handler: pickerHandler }),
    'browser-use: executable picker endpoint',
  ))
}
