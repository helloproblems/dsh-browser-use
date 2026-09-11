/** Read the optional DSH locale service at click time, including live switches. */
export function pickerLocale(service: unknown): string | undefined {
  if (typeof service !== 'object' || service === null || !('getLocale' in service) || typeof service.getLocale !== 'function') return undefined
  const snapshot: unknown = service.getLocale()
  if (typeof snapshot !== 'object' || snapshot === null || !('active' in snapshot) || typeof snapshot.active !== 'string') return undefined
  try { return Intl.getCanonicalLocales(snapshot.active)[0] } catch { return undefined }
}
