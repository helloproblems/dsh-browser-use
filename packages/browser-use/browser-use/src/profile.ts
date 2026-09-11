import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import type { BrowserUseSettings } from './backend.ts'

const anonymousOwners = new WeakMap<object, string>()

/** The owner is the Agent supplied by the tool execution context. */
export function browserWorkdir(owner: object): string {
  const cwd = (owner as { session?: { header?: { cwd?: string } } }).session?.header?.cwd
  return resolve(cwd || process.cwd())
}

/** Resolve persistent profiles by workdir, browser, and optionally session. */
export function sessionBrowserSettings(settings: BrowserUseSettings, owner: object): BrowserUseSettings {
  const root = settings.userDataDir?.trim()
  if (!root) return { ...settings }
  const cwd = browserWorkdir(owner)
  const workdir = createHash('sha256').update(process.platform === 'win32' ? cwd.toLowerCase() : cwd).digest('hex')
  const workspaceRoot = join(root, 'workdirs', workdir)
  if (!settings.sessionIsolation) return { ...settings, userDataDir: join(workspaceRoot, settings.browserType) }
  const sessionId = (owner as { session?: { id?: unknown } }).session?.id
  let identity: string
  if (typeof sessionId === 'string' && sessionId) {
    identity = `session:${sessionId}`
  } else {
    let id = anonymousOwners.get(owner)
    if (!id) { id = randomUUID(); anonymousOwners.set(owner, id) }
    identity = `owner:${id}`
  }
  // Hashing keeps arbitrary session IDs inside the configured root on every OS.
  const directory = createHash('sha256').update(identity).digest('hex')
  return { ...settings, userDataDir: join(workspaceRoot, 'sessions', settings.browserType, directory) }
}
