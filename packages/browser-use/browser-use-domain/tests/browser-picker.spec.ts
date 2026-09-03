import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_PICKER_HEADER,
  isSameOriginPickerRequest,
  pickBrowserExecutable,
} from '../src/browser-picker.js'

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
