import type { BrowserUseBackend } from './backend.js'

export class BrowserUseBackendRegistry {
  private readonly backends = new Map<string, BrowserUseBackend>()

  register(name: string, backend: BrowserUseBackend): () => void {
    if (this.backends.has(name)) throw new Error(`browser-use backend '${name}' is already registered`)
    this.backends.set(name, backend)
    return () => {
      if (this.backends.get(name) === backend) this.backends.delete(name)
    }
  }

  get(name: string): BrowserUseBackend {
    const backend = this.backends.get(name)
    if (!backend) {
      throw new Error(`browser-use backend '${name}' is not registered (registered: ${this.names().join(', ') || 'none'})`)
    }
    return backend
  }

  names(): string[] {
    return [...this.backends.keys()]
  }
}

