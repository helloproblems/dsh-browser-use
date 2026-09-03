/**
 * Stable error vocabulary for the browser-use hub.
 * @module browser-use/src/error
 */

/** Discriminant codes emitted by hub-level operations. */
export type BrowserUseErrorCode =
  | 'backend-not-found'
  | 'duplicate-backend'

/**
 * Error thrown by the browser-use hub. Consumers may switch on `code`; the
 * message remains diagnostic prose and is not part of the stable contract.
 */
export class BrowserUseError extends Error {
  override readonly name = 'BrowserUseError'

  constructor(
    readonly code: BrowserUseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
