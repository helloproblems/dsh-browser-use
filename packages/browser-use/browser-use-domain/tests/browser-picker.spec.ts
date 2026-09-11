import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_PICKER_HEADER,
  isSameOriginPickerRequest,
  pickBrowserExecutable,
  pickUserDataDirectory,
  pickHostUserDataDirectory,
  pickHostBrowserExecutable,
} from '../src/browser-picker.ts'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function executableFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'browser-picker-'))
  temporaryPaths.push(directory)
  const executable = join(directory, 'chrome.exe')
  await writeFile(executable, '')
  await chmod(executable, 0o755)
  return executable
}

describe('browser executable picker', () => {
  it.each(['chrome', 'edge'] as const)('uses the DSH picker for the %s installation directory', async browserType => {
    const directory = dirname(await executableFixture())
    const executable = join(directory, browserType === 'edge' ? 'msedge.exe' : 'chrome.exe')
    await writeFile(executable, '')
    await chmod(executable, 0o755)
    const signal = new AbortController().signal
    const pick = vi.fn(async () => directory)
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await expect(pickHostBrowserExecutable({ capability: () => ({ kind: 'native', pick }) }, browserType, signal, { platformName: 'win32', run })).resolves.toBe(executable)
    expect(pick).toHaveBeenCalledWith(signal)
    expect(run).not.toHaveBeenCalled()
  })

  it('resolves an Application subdirectory and rejects the wrong browser without global discovery', async () => {
    const directory = dirname(await executableFixture())
    await mkdir(join(directory, 'Application'))
    const edge = join(directory, 'Application', 'msedge.exe')
    await writeFile(edge, '')
    await chmod(edge, 0o755)
    const signal = new AbortController().signal
    const service = { capability: () => ({ kind: 'native', pick: async () => directory }) }
    await expect(pickHostBrowserExecutable(service, 'edge', signal, { platformName: 'win32' })).resolves.toBe(edge)
    const wrongDirectory = { capability: () => ({ kind: 'native', pick: async () => join(directory, 'Application') }) }
    await expect(pickHostBrowserExecutable(wrongDirectory, 'chrome', signal, { platformName: 'win32' })).rejects.toThrow('未找到 Google Chrome')
  })

  it('preserves DSH cancellation and service errors for browser selection', async () => {
    const signal = new AbortController().signal
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await expect(pickHostBrowserExecutable({ capability: () => ({ kind: 'native', pick: async () => null }) }, 'chrome', signal, { run })).resolves.toBeNull()
    await expect(pickHostBrowserExecutable({ capability: () => ({ kind: 'native', pick: async () => { throw new Error('host failed') } }) }, 'chrome', signal, { run })).rejects.toThrow('host failed')
    expect(run).not.toHaveBeenCalled()
  })

  it('accepts only same-origin requests carrying the picker header', () => {
    const request = {
      headers: {
        origin: 'http://127.0.0.1:3080',
        host: '127.0.0.1:3080',
        [BROWSER_PICKER_HEADER]: '1',
      },
    } as unknown as IncomingMessage
    expect(isSameOriginPickerRequest(request)).toBe(true)
    request.headers.origin = 'https://example.com'
    expect(isSameOriginPickerRequest(request)).toBe(false)
  })

  it('returns the absolute executable selected by the Windows dialog', async () => {
    const executable = await executableFixture()
    const run = vi.fn(async () => ({ stdout: executable, stderr: '' }))
    await expect(pickBrowserExecutable('chrome', new AbortController().signal, {
      platformName: 'win32',
      initialPath: executable,
      run,
    })).resolves.toBe(executable)
    expect(run).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-STA', '-Command']),
      expect.any(AbortSignal),
      expect.objectContaining({ DSH_BROWSER_PICKER_INITIAL: executable }),
    )
  })

  it('preserves cancellation as a null result', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await expect(pickBrowserExecutable('chrome', new AbortController().signal, {
      platformName: 'win32',
      initialPath: 'C:\\Browser\\chrome.exe',
      run,
    })).resolves.toBeNull()
  })
})

describe('browser user data directory picker', () => {
  it('prefers the DSH native service and forwards cancellation without starting PowerShell', async () => {
    const directory = dirname(await executableFixture())
    const pick = vi.fn(async () => directory)
    const run = vi.fn(async () => ({ stdout: 'unexpected', stderr: '' }))
    const signal = new AbortController().signal
    await expect(pickHostUserDataDirectory({ capability: () => ({ kind: 'native', pick }) }, signal, { run })).resolves.toBe(directory)
    expect(pick).toHaveBeenCalledWith(signal)
    expect(run).not.toHaveBeenCalled()
  })

  it('preserves DSH picker cancellation and does not fall back after a service failure', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    const signal = new AbortController().signal
    await expect(pickHostUserDataDirectory({ capability: () => ({ kind: 'native', pick: async () => null }) }, signal, { run })).resolves.toBeNull()
    await expect(pickHostUserDataDirectory({ capability: () => ({ kind: 'native', pick: async () => { throw new Error('host picker failed') } }) }, signal, { run })).rejects.toThrow('host picker failed')
    await expect(pickHostUserDataDirectory({ capability: () => ({ kind: 'browse' }) }, signal, { run })).rejects.toThrow('not configured with a native')
    expect(run).not.toHaveBeenCalled()
  })

  it('uses the standalone adapter only when the DSH service is absent', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await expect(pickHostUserDataDirectory(undefined, new AbortController().signal, { platformName: 'win32', locale: 'zh-CN', run })).resolves.toBeNull()
    expect(run).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.any(AbortSignal), expect.objectContaining({ DSH_BROWSER_PICKER_LOCALE: 'zh-CN' }))
  })

  it.each(['darwin', 'linux'] as const)('does not treat an aborted %s process as a successful cancellation', async platformName => {
    const controller = new AbortController()
    const run = vi.fn(async (_command: string, _args: readonly string[], signal: AbortSignal) => {
      controller.abort()
      expect(signal.aborted).toBe(true)
      throw Object.assign(new Error('picker aborted'), { code: 1 })
    })
    await expect(pickUserDataDirectory(controller.signal, { platformName, run })).rejects.toThrow('picker aborted')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not launch a dialog for an already aborted request', async () => {
    const run = vi.fn(async () => ({ stdout: '', stderr: '' }))
    await expect(pickUserDataDirectory(AbortSignal.abort(new Error('cancelled')), { run })).rejects.toThrow('cancelled')
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['win32', 'darwin', 'linux'] as const)('selects folders on %s', async platformName => {
    const directory = dirname(await executableFixture())
    const run = vi.fn(async () => ({ stdout: directory, stderr: '' }))
    await expect(pickUserDataDirectory(new AbortController().signal, { platformName, initialPath: directory, run })).resolves.toBe(directory)
    if (platformName === 'win32') {
      expect(run).toHaveBeenCalledWith('powershell.exe', expect.any(Array), expect.any(AbortSignal),
        expect.objectContaining({ DSH_BROWSER_PICKER_DIRECTORY: '1', DSH_BROWSER_PICKER_INITIAL: directory }))
    } else if (platformName === 'darwin') {
      expect(run).toHaveBeenCalledWith('osascript', expect.arrayContaining([expect.stringContaining('choose folder')]), expect.any(AbortSignal))
    } else {
      expect(run).toHaveBeenCalledWith('zenity', expect.arrayContaining(['--directory']), expect.any(AbortSignal))
    }
  })

  it('falls back to kdialog folder selection when zenity is unavailable', async () => {
    const directory = dirname(await executableFixture())
    const run = vi.fn().mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
      .mockResolvedValueOnce({ stdout: directory, stderr: '' })
    await expect(pickUserDataDirectory(new AbortController().signal, { platformName: 'linux', run })).resolves.toBe(directory)
    expect(run).toHaveBeenLastCalledWith('kdialog', ['--getexistingdirectory', ''], expect.any(AbortSignal))
  })

  it('rejects files and relative paths', async () => {
    const executable = await executableFixture()
    for (const [path, message] of [[executable, 'not a directory'], ['relative/path', 'non-absolute']] as const) {
      await expect(pickUserDataDirectory(new AbortController().signal, {
        platformName: 'win32', run: async () => ({ stdout: path, stderr: '' }),
      })).rejects.toThrow(message)
    }
  })

  it.each(['win32', 'darwin', 'linux'] as const)('preserves cancellation on %s', async platformName => {
    const run = vi.fn(async () => {
      if (platformName !== 'win32') throw Object.assign(new Error('cancelled'), { code: 1 })
      return { stdout: '', stderr: '' }
    })
    await expect(pickUserDataDirectory(new AbortController().signal, { platformName, run })).resolves.toBeNull()
  })
})
