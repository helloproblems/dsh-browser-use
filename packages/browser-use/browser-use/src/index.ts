/**
 * Browser-use hub (`ctx.browserUse`): shared backend contracts plus a named
 * backend registry. The hub itself owns no browser resources.
 * @module browser-use
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { BackendRegistry } from './registry.ts'

export type { BrowserType, BrowserUseBackend, BrowserUseResult, BrowserUseSettings, BrowserUseTool } from './backend.ts'
export { browserExecutableCandidates, discoverBrowserExecutable } from './executable.ts'
export type { BrowserExecutableDiscoveryOptions } from './executable.ts'
export { BrowserUseError } from './error.ts'
export type { BrowserUseErrorCode } from './error.ts'
export { BackendRegistry, BrowserUseBackendRegistry } from './registry.ts'

/**
 * Derive the lifecycle-only Cordis service published by a named backend. Domain
 * providers inject this key so activation cannot race backend registration.
 */
export function browserUseBackendServiceKey(name: string): string {
  return `browserUse.backend.${name}`
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    browserUse: BrowserUse
  }
}

/** Browser automation hub service. Concrete backend plugins register under `backend`. */
export class BrowserUse extends Service {
  /** Named backend table; multiple implementations may stay mounted together. */
  readonly backend: BackendRegistry = new BackendRegistry()

  constructor(ctx: Context) {
    super(ctx, 'browserUse')
  }
}

// Keep the default export limited to the service class so Cordis loads this
// package as a service plugin rather than a function-plugin namespace.
export default BrowserUse
