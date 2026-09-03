import { Service, type Context } from '@deepseek-ai/cordis'
import { BrowserUseBackendRegistry } from './registry.js'

export type { BrowserUseBackend, BrowserUseResult, BrowserUseSettings, BrowserUseTool } from './backend.js'
export { BrowserUseBackendRegistry } from './registry.js'

export function browserUseBackendServiceKey(name: string): string {
  return `browserUse.backend.${name}`
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    browserUse: BrowserUse
  }
}

export class BrowserUse extends Service {
  readonly backend = new BrowserUseBackendRegistry()

  constructor(ctx: Context) {
    super(ctx, 'browserUse')
  }
}

export default BrowserUse

