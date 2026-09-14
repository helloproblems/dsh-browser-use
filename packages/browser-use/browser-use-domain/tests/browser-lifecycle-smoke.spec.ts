import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { ChromeBrowserUseBackend } from 'browser-use-chrome'
import { EdgeBrowserUseBackend } from 'browser-use-edge'

it.runIf(process.env.BROWSER_LIFECYCLE_SMOKE === '1').each(['chrome', 'edge'] as const)(
  '%s cancels browser work and reopens its persistent profile after cleanup', async browserType => {
    const workspace = await mkdtemp(join(tmpdir(), 'browser-lifecycle-'))
    let started!: () => void
    const scriptStarted = new Promise<void>(resolve => { started = resolve })
    let lateRequests = 0
    const server = createServer((req, res) => {
      if (req.url === '/started') { started(); res.end('started'); return }
      if (req.url === '/late') { lateRequests++; res.end('late'); return }
      res.setHeader('content-type', 'text/html')
      res.end('<title>Browser lifecycle</title><h1>Browser lifecycle</h1>')
    }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const settings = { browserType, headless: true, browserPath: '', userDataDir: join(workspace, 'profiles') }
    const backend = browserType === 'chrome'
      ? new ChromeBrowserUseBackend(() => settings, new Context().logger, { toolCallTimeoutMs: 120000 })
      : new EdgeBrowserUseBackend()
    const owner = { session: { id: 'lifecycle', header: { cwd: workspace } } }
    const navigate = browserType === 'chrome' ? 'new_page' : 'browser_navigate'
    const evaluate = browserType === 'chrome' ? 'evaluate_script' : 'browser_evaluate'
    const controller = new AbortController()
    try {
      await backend.initialize()
      await backend.reconfigure(settings)
      await backend.execute(owner, navigate, { url })
      const running = backend.execute(owner, evaluate, { function: `async () => {
        await fetch('/started');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fetch('/late');
        return 'late';
      }` }, controller.signal)
      const rejected = expect(running).rejects.toThrow()
      await Promise.race([scriptStarted, delay(15000).then(() => { throw new Error('browser script did not start') })])
      controller.abort(new Error('cancelled by caller'))
      await rejected
      await delay(1200)
      expect(lateRequests).toBe(0)
      expect(JSON.stringify(await backend.execute(owner, navigate, { url }))).toContain(url)
      if (browserType === 'edge') {
        await backend.execute(owner, 'browser_close', {})
        expect(JSON.stringify(await backend.execute(owner, navigate, { url }))).toContain(url)
      }
      backend.release(owner)
      await backend.reconfigure(settings)
      expect(JSON.stringify(await backend.execute(owner, navigate, { url }))).toContain(url)
    } finally {
      controller.abort()
      try { await backend.close() } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) })
        if (dirname(workspace) !== tmpdir() || !basename(workspace).startsWith('browser-lifecycle-')) throw new Error('Unexpected smoke workspace')
        await rm(workspace, { recursive: true, force: true })
      }
    }
  }, 120000,
)
