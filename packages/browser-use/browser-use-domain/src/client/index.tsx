/** Browser settings section mounted in the DSH Client. */
import type { RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Button, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

import { browserPathError, readSettings, userDataDirError, type BrowserType, type SettingsValue } from './settings.ts'
import { localeSource, type LocaleSource } from './picker-locale.ts'
import { copy, displayError, errorText, SettingsError, type DisplayError } from './copy.ts'

const NS = 'browser-use'
const PICKER_ENDPOINT = '/browser-use/pick-browser-executable'
const DIRECTORY_PICKER_ENDPOINT = '/browser-use/pick-user-data-directory'
const PICKER_HEADER = 'x-dsh-browser-use-picker'
// Only these two settings RPC methods are consumed by the editor.
interface SettingsRemote {
  settings: {
    describe(): Promise<RemoteResult<SettingsDescribeValue>>
    replace(ns: string, value: SettingsValue, expectedRevision: number): Promise<RemoteResult<SettingsNamespaceView>>
  }
}


type View = { value: SettingsValue; revision: number }
const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: 20,
  alignItems: 'center',
  padding: '16px 0',
  borderBottom: '1px solid var(--dsw-alias-border-l3, var(--dsh-border-subtle))',
}
const label: CSSProperties = { fontSize: 14, fontWeight: 600 }
const desc: CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--dsw-alias-label-secondary, var(--dsh-text-secondary))',
  lineHeight: 1.5,
}
const control: CSSProperties = { width: '100%', minWidth: 0, justifySelf: 'stretch' }
const input: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  height: 34,
  border: '1px solid var(--dsw-alias-border-l2, var(--dsh-border-default))',
  background: 'var(--dsw-alias-bg-base, var(--dsh-bg-primary))',
  color: 'var(--dsw-alias-label-primary, var(--dsh-text-primary))',
  padding: '0 10px',
  borderRadius: 6,
}

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      disabled={disabled}
      aria-checked={checked}
      onClick={() => { onChange(!checked) }}
      style={{
        boxSizing: 'border-box',
        position: 'relative',
        width: 36,
        height: 20,
        padding: 2,
        border: 0,
        borderRadius: 10,
        background: checked
          ? 'var(--dsw-alias-brand-primary, #2f6feb)'
          : 'var(--dsw-alias-border-l3, #9aa3af)',
        cursor: 'pointer',
        justifySelf: 'end',
      }}
    >
      <span style={{
        display: 'block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--dsw-alias-label-primary-foreground, #fff)',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 120ms ease',
      }} />
    </button>
  )
}

/** Shared path editor for both native picker modes. */
function PathField(props: {
  title: string; description: string; value: string; placeholder: string
  error: string; errorId: string; buttonLabel: string
  locale: string
  disabled: boolean; picking: boolean
  onChange(value: string): void; onPick(): void; onCancel(): void
}) {
  return <div style={row}>
    <div><div style={label}>{props.title}</div><div style={desc}>{props.description}</div></div>
    <div style={{ ...control, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px', gap: 8 }}>
      <input
        aria-label={props.title}
        value={props.value}
        placeholder={props.placeholder}
        style={input}
        disabled={props.disabled}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? props.errorId : undefined}
        onChange={event => { props.onChange(event.target.value) }}
      />
      <Button variant="outline" size="sm" icon={<IconFolderOpenOutline16 />}
        disabled={props.disabled && !props.picking}
        title={props.picking ? copy(props.locale, 'cancelHint') : copy(props.locale, 'selectPath', { name: props.title })}
        style={{ height: 34, whiteSpace: 'nowrap' }} onClick={props.picking ? props.onCancel : props.onPick}
      >{props.picking ? copy(props.locale, 'cancel') : props.buttonLabel}</Button>
    </div>
  </div>
}

function Section({ remote, localeSource: language }: { remote: SettingsRemote; localeSource: LocaleSource }) {
  const locale = useSyncExternalStore(language.subscribe, language.getSnapshot, language.getSnapshot)
  const t = (key: Parameters<typeof copy>[1]) => copy(locale, key)
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<SettingsValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<'browser' | 'directory' | null>(null)
  const pickerRequest = useRef<AbortController | null>(null)
  const [error, setError] = useState<DisplayError | null>(null)
  useEffect(() => {
    let active = true
    void remote.settings.describe().then((answer) => {
      if (!active) return
      if (!answer.ok) throw new Error(answer.error.message)
      const found = answer.value.namespaces.find((item) => item.ns === NS)
      if (!found) throw new SettingsError('unavailable')
      const value = readSettings(found.value)
      setView({ value, revision: found.revision })
      setDraft(value)
    }).catch((cause: unknown) => { if (active) setError(displayError(cause, 'loadFailed')) })
    return () => { active = false; pickerRequest.current?.abort() }
  }, [remote])
  if (!draft || !view) {
    return <div style={{ padding: '20px 0', color: 'var(--dsw-alias-label-secondary, var(--dsh-text-secondary))' }}>{errorText(locale, error) || t('loading')}</div>
  }
  const validationError = browserPathError(draft, locale)
  const directoryError = userDataDirError(draft.userDataDir, locale)
  const save = async () => {
    if (browserPathError(draft) || userDataDirError(draft.userDataDir)) return
    setSaving(true)
    setError(null)
    try {
      const next = { ...draft, browserPath: draft.browserPath.trim(), userDataDir: draft.userDataDir?.trim() ?? '' }
      const answer = await remote.settings.replace(NS, next, view.revision)
      if (!answer.ok) { setError({ key: 'saveFailed', detail: answer.error.message }); return }
      const value = readSettings(answer.value.value)
      setView({ value, revision: answer.value.revision })
      setDraft(value)
    } catch (cause: unknown) {
      setError(displayError(cause, 'saveFailed'))
    } finally {
      setSaving(false)
    }
  }
  const pickPath = async (kind: 'browser' | 'directory') => {
    if (pickerRequest.current) return
    const controller = new AbortController()
    pickerRequest.current = controller
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 120_000)
    setPicking(kind)
    setError(null)
    try {
      const initialPath = kind === 'browser' ? draft.browserPath.trim() : draft.userDataDir?.trim() ?? ''
      const query = new URLSearchParams({ browserType: draft.browserType, initialPath })
      query.set('locale', language.getSnapshot())
      const endpoint = kind === 'browser' ? PICKER_ENDPOINT : DIRECTORY_PICKER_ENDPOINT
      const response = await fetch(`${endpoint}?${query}`, {
        method: 'POST',
        headers: { [PICKER_HEADER]: '1' },
        signal: controller.signal,
      })
      const answer = await response.json() as { path?: unknown; error?: unknown; code?: unknown }
      if (!response.ok) {
        if (answer.code === 'picker-timeout') throw new SettingsError('pickerTimeout')
        if (answer.code === 'browser-not-found') throw new SettingsError('browserNotFound', { browser: draft.browserType === 'edge' ? 'Microsoft Edge' : 'Google Chrome' })
        if (typeof answer.error === 'string') throw new Error(answer.error)
        throw new SettingsError(kind === 'browser' ? 'browserPickerFailed' : 'directoryPickerFailed')
      }
      if (!controller.signal.aborted && typeof answer.path === 'string') {
        const path = answer.path
        setDraft(current => current ? { ...current, [kind === 'browser' ? 'browserPath' : 'userDataDir']: path } : current)
      }
    } catch (cause: unknown) {
      if (timedOut) setError({ key: 'pickerTimeout' })
      else if (!controller.signal.aborted) setError(displayError(cause, kind === 'browser' ? 'browserPickerFailed' : 'directoryPickerFailed'))
    } finally {
      clearTimeout(timeout)
      pickerRequest.current = null
      setPicking(null)
    }
  }
  return <div style={{ maxWidth: 760 }}>
    <div style={row}>
      <div><div style={label}>{t('browserType')}</div><div style={desc}>{t('browserTypeDescription')}</div></div>
      <select
        aria-label={t('browserType')}
        value={draft.browserType}
        style={{ ...input, ...control }}
        disabled={saving || !!picking}
        onChange={event => { setDraft({ ...draft, browserType: event.target.value as BrowserType }) }}
      >
        <option value="chrome">Google Chrome</option>
        <option value="edge">Microsoft Edge</option>
      </select>
    </div>
    <div style={row}>
      <div><div style={label}>{t('headless')}</div><div style={desc}>{t('headlessDescription')}</div></div>
      <div style={{ ...control, display: 'flex', justifyContent: 'flex-end' }}>
        <Switch label={t('headless')} checked={draft.headless} disabled={saving || !!picking} onChange={headless => { setDraft({ ...draft, headless }) }} />
      </div>
    </div>
    <PathField locale={locale} title={t('browserPath')} description={t('browserPathDescription')}
      value={draft.browserPath} placeholder={t('browserPathPlaceholder')}
      error={validationError} errorId="browser-path-error" buttonLabel={t('select')}
      disabled={saving || !!picking} picking={picking === 'browser'}
      onChange={browserPath => { setDraft({ ...draft, browserPath }) }} onPick={() => { void pickPath('browser') }}
      onCancel={() => { pickerRequest.current?.abort() }}
    />
    <PathField locale={locale} title={t('userDataDir')} description={t('userDataDirDescription')}
      value={draft.userDataDir ?? ''} placeholder={t('userDataDirPlaceholder')}
      error={directoryError} errorId="browser-user-data-error" buttonLabel={t('select')}
      disabled={saving || !!picking} picking={picking === 'directory'}
      onChange={userDataDir => { setDraft({ ...draft, userDataDir }) }} onPick={() => { void pickPath('directory') }}
      onCancel={() => { pickerRequest.current?.abort() }}
    />
    <div style={row}>
      <div><div style={label}>{t('isolation')}</div><div style={desc}>{t('isolationDescription')}</div></div>
      <select
        aria-label={t('isolation')}
        value={draft.sessionIsolation ? 'session' : 'workspace'}
        style={{ ...input, ...control }}
        disabled={saving || !!picking}
        onChange={event => { setDraft({ ...draft, sessionIsolation: event.target.value === 'session' }) }}
      >
        <option value="workspace">{t('workspace')}</option>
        <option value="session">{t('session')}</option>
      </select>
    </div>
    {directoryError ? <p id="browser-user-data-error" role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{directoryError}</p> : null}
    {validationError ? <p id="browser-path-error" role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{validationError}</p> : null}
    {error ? <p role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{errorText(locale, error)}</p> : null}
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}>
      <Button variant="primary" disabled={saving || !!picking || !!validationError || !!directoryError} onClick={() => { void save() }}>{saving ? t('saving') : t('save')}</Button>
    </div>
  </div>
}

export const inject = ['slots', 'remote', 'remote.settings', 'locale']
export function apply(ctx: Context): void {
  // Guarded context service reads can return a new proxy on every render.
  const remote = ctx.remote
  const language = localeSource(ctx.get('locale'))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'browser-use', order: 30, label: () => copy(language.getSnapshot(), 'section') }, () => <Section remote={remote} localeSource={language} />))
}
