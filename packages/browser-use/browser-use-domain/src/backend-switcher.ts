import type { BrowserUseBackend, BrowserUseSettings, BrowserUseTool } from 'browser-use'

type Publish = (backend: BrowserUseBackend, tool: BrowserUseTool, execute: BrowserUseBackend['execute']) => () => void
interface Active {
  backend: BrowserUseBackend
  settings: BrowserUseSettings
  owners: Set<object>
  unregister: (() => void)[]
}

/** Serializes calls with switches so sessions are never recycled mid-call. */
export class BackendSwitcher {
  private available = new Map<string, BrowserUseBackend>()
  private active: Active | undefined
  private tail: Promise<unknown> = Promise.resolve()
  private stopped = false
  private closing?: Promise<void>

  constructor(private desired: BrowserUseSettings, private readonly backendName: (settings: BrowserUseSettings) => string, private readonly publish: Publish) {}

  attach(name: string, backend: BrowserUseBackend): Promise<void> {
    this.available.set(name, backend)
    return this.enqueue(() => this.activate())
  }

  detach(name: string, backend: BrowserUseBackend): Promise<void> {
    if (this.available.get(name) === backend) this.available.delete(name)
    return this.enqueue(async () => {
      if (this.active?.backend === backend) {
        const previous = this.active
        this.active = undefined
        previous.unregister.forEach(dispose => dispose())
        for (const owner of previous.owners) previous.backend.release(owner)
      }
    })
  }

  configure(settings: BrowserUseSettings): Promise<void> {
    const next = { ...settings }
    return this.enqueue(async () => {
      this.desired = next
      await this.activate()
    })
  }

  release(owner: object): Promise<void> {
    return this.enqueue(async () => {
      if (this.active?.owners.delete(owner)) this.active.backend.release(owner)
    })
  }

  close(): Promise<void> {
    this.stopped = true
    return this.closing ??= this.enqueue(async () => {
      const previous = this.active
      this.active = undefined
      if (previous) {
        previous.unregister.forEach(dispose => dispose())
        await this.releaseActive(previous)
      }
    })
  }

  private async activate(): Promise<void> {
    if (this.stopped) return
    const name = this.backendName(this.desired)
    const backend = this.available.get(name)
    if (!backend) throw new Error(`Browser backend '${name}' is unavailable; enable its plugin. The previous backend remains active.`)
    const settings = { ...this.desired }
    if (this.active?.backend === backend) {
      if (JSON.stringify(settings) !== JSON.stringify(this.active.settings)) {
        await backend.reconfigure(settings)
        this.active.settings = settings
      }
      return
    }
    await backend.reconfigure(settings)
    if (this.stopped || this.available.get(name) !== backend) return
    const next: Active = { backend, settings, owners: new Set(), unregister: [] }
    try {
      for (const tool of backend.tools()) {
        next.unregister.push(this.publish(backend, tool, (owner, name, args) => this.enqueue(async () => {
          if (this.stopped || this.active !== next || ![...this.available.values()].includes(backend)) {
            throw new Error('Browser backend changed; refresh the tool list and retry with the active browser tools')
          }
          next.owners.add(owner)
          return backend.execute(owner, name, args)
        })))
      }
    } catch (error) {
      next.unregister.forEach(dispose => dispose())
      throw error
    }
    const previous = this.active
    this.active = next
    if (previous) {
      previous.unregister.forEach(dispose => dispose())
      await this.releaseActive(previous)
    }
  }

  private async releaseActive(previous: Active): Promise<void> {
    for (const owner of previous.owners) previous.backend.release(owner)
    previous.owners.clear()
    // Drain queued MCP session releases before finishing the switch.
    // close() belongs to the provider and would permanently dispose the backend.
    if ([...this.available.values()].includes(previous.backend)) await previous.backend.reconfigure(previous.settings)
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = this.tail.then(run)
    this.tail = result.catch(() => {})
    return result
  }
}
