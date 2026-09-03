/**
 * Backend-facing contracts for the browser-use hub. The hub owns no browser
 * resources; concrete backend packages implement these interfaces.
 * @module browser-use/src/backend
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Runtime settings shared with the selected browser backend. */
export interface BrowserUseSettings {
  /** Launch without a visible browser window when the backend starts one. */
  headless: boolean
  /** Browser selected by the settings surface. */
  browserType: BrowserType
  /** Absolute path of the browser executable. */
  browserPath: string
}

/** Browser choices understood by the shared settings contract. */
export type BrowserType = 'chrome' | 'edge'

/** One backend tool exposed through the browser-use domain. */
export interface BrowserUseTool {
  /** Backend-local tool name. */
  name: string
  /** Human-readable tool description passed to the model. */
  description: string
  /** JSON Schema describing the tool input. */
  parameters: Record<string, unknown>
}

/** Losslessly JSON-serializable result returned by a backend tool. */
export interface BrowserUseResult {
  /** MCP-compatible content blocks. */
  content: JsonValue[]
  /** Optional structured result supplied by the backend. */
  structuredContent?: JsonValue
}

/**
 * One registered browser automation backend. A backend owns its shared browser
 * connection and any owner-scoped execution contexts created over it.
 */
export interface BrowserUseBackend {
  /** Namespace used when the domain publishes this backend's tools. */
  readonly browserType: string

  /**
   * Return the stable tool catalog for this backend instance. The domain reads
   * the catalog once while mounting its tool registrations.
   */
  tools(): readonly BrowserUseTool[]

  /**
   * Execute one catalog tool for an opaque owner. Backends may use owner object
   * identity to isolate sessions and reuse their browser context.
   */
  execute(owner: object, toolName: string, args: Record<string, unknown>): Promise<BrowserUseResult>

  /**
   * Release resources associated with one owner. Repeated calls are harmless
   * and do not close resources shared with other owners.
   */
  release(owner: object): void

  /** Apply a new settings snapshot, recycling shared resources when required. */
  reconfigure(settings: BrowserUseSettings): Promise<void>

  /**
   * Release all owner-scoped and shared resources. Closing is idempotent and
   * resolves after teardown has completed.
   */
  close(): Promise<void>
}
