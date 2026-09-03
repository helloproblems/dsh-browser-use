/**
 * Named backend registry for the browser-use hub.
 * @module browser-use/src/registry
 */

import type { BrowserUseBackend } from './backend.js'
import { BrowserUseError } from './error.js'

/**
 * Mutable name-to-backend table. Multiple implementations remain registered
 * side by side; the domain configuration selects which one to consume.
 */
export class BackendRegistry {
  private readonly backends = new Map<string, BrowserUseBackend>()

  /**
   * Register a backend. The returned disposer removes only this registration;
   * lifecycle ownership and backend closure remain with the provider plugin.
   */
  register(name: string, backend: BrowserUseBackend): () => void {
    if (this.backends.has(name)) {
      throw new BrowserUseError('duplicate-backend', `browser-use backend '${name}' is already registered`)
    }

    this.backends.set(name, backend)
    return () => {
      if (this.backends.get(name) === backend) {
        this.backends.delete(name)
      }
    }
  }

  /** Resolve one registered backend by name. */
  get(name: string): BrowserUseBackend {
    const backend = this.backends.get(name)
    if (!backend) {
      throw new BrowserUseError(
        'backend-not-found',
        `browser-use backend '${name}' is not registered (registered: ${[...this.backends.keys()].join(', ') || 'none'})`,
      )
    }
    return backend
  }

  /** Return a snapshot of registered backend names for diagnostics. */
  names(): string[] {
    return [...this.backends.keys()]
  }
}

/** @deprecated Use {@link BackendRegistry}. */
export { BackendRegistry as BrowserUseBackendRegistry }
