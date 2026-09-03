import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
export interface DiscoveryOptions { browserUrl?: string; fetchImpl?: typeof fetch; homeDir?: string; platformName?: NodeJS.Platform; ports?: readonly number[] }
export interface DiscoveredBrowser { url: string; source: 'configured' | 'active-port' | 'port-scan' }
const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229]
function activePortFiles(home: string, os: NodeJS.Platform): string[] {
  if (os === 'win32') { const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'); return [join(local, 'Google', 'Chrome', 'User Data', 'DevToolsActivePort'), join(local, 'Google', 'Chrome Beta', 'User Data', 'DevToolsActivePort'), join(local, 'Google', 'Chrome Dev', 'User Data', 'DevToolsActivePort'), join(local, 'Google', 'Chrome SxS', 'User Data', 'DevToolsActivePort')] }
  if (os === 'darwin') return [join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'DevToolsActivePort')]
  return [join(home, '.config', 'google-chrome', 'DevToolsActivePort')]
}
async function responds(url: string, fetchImpl: typeof fetch): Promise<boolean> { try { const response = await fetchImpl(`${url}/json/version`, { signal: AbortSignal.timeout(350) }); if (!response.ok) return false; const value = await response.json() as { webSocketDebuggerUrl?: unknown }; return typeof value.webSocketDebuggerUrl === 'string' } catch { return false } }
export async function discoverBrowser(options: DiscoveryOptions = {}): Promise<DiscoveredBrowser | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch
  if (options.browserUrl) { const configured = options.browserUrl.replace(/\/$/, ''); if (await responds(configured, fetchImpl)) return { url: configured, source: 'configured' } }
  for (const file of activePortFiles(options.homeDir ?? homedir(), options.platformName ?? platform())) { try { const [rawPort] = (await readFile(file, 'utf8')).split(/\r?\n/); const port = Number(rawPort); if (!Number.isInteger(port) || port < 1 || port > 65535) continue; const url = `http://127.0.0.1:${port}`; if (await responds(url, fetchImpl)) return { url, source: 'active-port' } } catch {} }
  for (const port of options.ports ?? DEFAULT_PORTS) { const url = `http://127.0.0.1:${port}`; if (await responds(url, fetchImpl)) return { url, source: 'port-scan' } }
  return undefined
}
