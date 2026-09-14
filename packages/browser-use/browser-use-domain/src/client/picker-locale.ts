/** Read the optional DSH locale service at click time, including live switches. */
export function pickerLocale(service: unknown): string | undefined {
  if (typeof service !== 'object' || service === null || !('getLocale' in service) || typeof service.getLocale !== 'function') return undefined
  const snapshot: unknown = service.getLocale()
  if (typeof snapshot !== 'object' || snapshot === null || !('active' in snapshot) || typeof snapshot.active !== 'string') return undefined
  try { return Intl.getCanonicalLocales(snapshot.active)[0] } catch { return undefined }
}

export interface LocaleSource {
  getSnapshot(): string
  subscribe(listener: () => void): () => void
}

/** Stable React external-store adapter for the DSH locale service. */
export function localeSource(service: unknown): LocaleSource {
  return {
    getSnapshot: () => pickerLocale(service) ?? 'en',
    subscribe: listener => {
      if (typeof service !== 'object' || service === null || !('subscribe' in service) || typeof service.subscribe !== 'function') return () => {}
      const dispose: unknown = service.subscribe(listener)
      return typeof dispose === 'function' ? () => { dispose() } : () => {}
    },
  }
}
