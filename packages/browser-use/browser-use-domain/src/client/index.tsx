/** Browser settings section mounted in the DSH Client. */
import type { RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

import { browserPathError, readSettings, userDataDirError, type BrowserType, type SettingsValue } from './settings.ts'
import { pickerLocale } from './picker-locale.ts'

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

function Switch({ checked, onChange, label = '无头模式', disabled = false }: { checked: boolean; onChange(value: boolean): void; label?: string; disabled?: boolean }) {
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
        title={props.picking ? '正在等待系统选择窗口；点击取消选择' : `选择${props.title}`}
        style={{ height: 34, whiteSpace: 'nowrap' }} onClick={props.picking ? props.onCancel : props.onPick}
      >{props.picking ? '取消选择' : props.buttonLabel}</Button>
    </div>
  </div>
}

function Section({ remote, getLocale }: { remote: SettingsRemote; getLocale(): string | undefined }) {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<SettingsValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<'browser' | 'directory' | null>(null)
  const pickerRequest = useRef<AbortController | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void remote.settings.describe().then((answer) => {
      if (!active) return
      if (!answer.ok) throw new Error(answer.error.message)
      const found = answer.value.namespaces.find((item) => item.ns === NS)
      if (!found) throw new Error('浏览器自动化设置不可用')
      const value = readSettings(found.value)
      setView({ value, revision: found.revision })
      setDraft(value)
    }).catch((cause: unknown) => { if (active) setError(String(cause)) })
    return () => { active = false; pickerRequest.current?.abort() }
  }, [remote])
  if (!draft || !view) {
    return <div style={{ padding: '20px 0', color: 'var(--dsw-alias-label-secondary, var(--dsh-text-secondary))' }}>{error || '正在读取设置...'}</div>
  }
  const validationError = browserPathError(draft)
  const directoryError = userDataDirError(draft.userDataDir)
  const save = async () => {
    if (browserPathError(draft) || userDataDirError(draft.userDataDir)) return
    setSaving(true)
    setError('')
    try {
      const next = { ...draft, browserPath: draft.browserPath.trim(), userDataDir: draft.userDataDir?.trim() ?? '' }
      const answer = await remote.settings.replace(NS, next, view.revision)
      if (!answer.ok) { setError(answer.error.message); return }
      const value = readSettings(answer.value.value)
      setView({ value, revision: answer.value.revision })
      setDraft(value)
    } catch (cause: unknown) {
      setError(String(cause))
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
    setError('')
    try {
      const initialPath = kind === 'browser' ? draft.browserPath.trim() : draft.userDataDir?.trim() ?? ''
      const query = new URLSearchParams({ browserType: draft.browserType, initialPath })
      const locale = getLocale()
      if (locale) query.set('locale', locale)
      const endpoint = kind === 'browser' ? PICKER_ENDPOINT : DIRECTORY_PICKER_ENDPOINT
      const response = await fetch(`${endpoint}?${query}`, {
        method: 'POST',
        headers: { [PICKER_HEADER]: '1' },
        signal: controller.signal,
      })
      const answer = await response.json() as { path?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof answer.error === 'string' ? answer.error : kind === 'browser' ? '浏览器文件选择失败' : '用户数据目录选择失败')
      if (!controller.signal.aborted && typeof answer.path === 'string') {
        const path = answer.path
        setDraft(current => current ? { ...current, [kind === 'browser' ? 'browserPath' : 'userDataDir']: path } : current)
      }
    } catch (cause: unknown) {
      if (timedOut) setError('选择窗口等待超时，请重试或手动填写路径。')
      else if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(timeout)
      pickerRequest.current = null
      setPicking(null)
    }
  }
  return <div style={{ maxWidth: 760 }}>
    <div style={row}>
      <div><div style={label}>浏览器类型</div><div style={desc}>保存后切换浏览器，无需重启；旧浏览器会话将被释放。</div></div>
      <select
        aria-label="浏览器类型"
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
      <div><div style={label}>无头模式</div><div style={desc}>由后端启动浏览器时不显示浏览器窗口。</div></div>
      <div style={{ ...control, display: 'flex', justifyContent: 'flex-end' }}>
        <Switch checked={draft.headless} disabled={saving || !!picking} onChange={headless => { setDraft({ ...draft, headless }) }} />
      </div>
    </div>
    <PathField title="浏览器位置" description="留空时自动检索；点击选择浏览器安装目录，自动定位可执行文件，也可手动填写文件路径。"
      value={draft.browserPath} placeholder="自动检索所选浏览器"
      error={validationError} errorId="browser-path-error" buttonLabel="选择"
      disabled={saving || !!picking} picking={picking === 'browser'}
      onChange={browserPath => { setDraft({ ...draft, browserPath }) }} onPick={() => { void pickPath('browser') }}
      onCancel={() => { pickerRequest.current?.abort() }}
    />
    <PathField title="浏览器用户数据目录" description="选择 DSH 所在电脑上的文件夹作为数据根目录，自动按工作区和浏览器类型隔离；留空使用临时隔离模式。"
      value={draft.userDataDir ?? ''} placeholder="留空使用临时隔离模式"
      error={directoryError} errorId="browser-user-data-error" buttonLabel="选择"
      disabled={saving || !!picking} picking={picking === 'directory'}
      onChange={userDataDir => { setDraft({ ...draft, userDataDir }) }} onPick={() => { void pickPath('directory') }}
      onCancel={() => { pickerRequest.current?.abort() }}
    />
    <div style={row}>
      <div><div style={label}>数据隔离级别</div><div style={desc}>工作区：同一工作目录复用数据，同类浏览器同时只能由一个会话使用。会话：每个会话独立保存数据，恢复同一会话时复用。目录留空时始终使用临时隔离模式。</div></div>
      <select
        aria-label="数据隔离级别"
        value={draft.sessionIsolation ? 'session' : 'workspace'}
        style={{ ...input, ...control }}
        disabled={saving || !!picking}
        onChange={event => { setDraft({ ...draft, sessionIsolation: event.target.value === 'session' }) }}
      >
        <option value="workspace">工作区</option>
        <option value="session">会话</option>
      </select>
    </div>
    {directoryError ? <p id="browser-user-data-error" role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{directoryError}</p> : null}
    {validationError ? <p id="browser-path-error" role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{validationError}</p> : null}
    {error ? <p role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{error}</p> : null}
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}>
      <Button variant="primary" disabled={saving || !!picking || !!validationError || !!directoryError} onClick={() => { void save() }}>{saving ? '正在保存...' : '保存'}</Button>
    </div>
  </div>
}

export const inject = ['slots', 'remote', 'remote.settings']
export function apply(ctx: Context): void {
  // Guarded context service reads can return a new proxy on every render.
  const remote = ctx.remote
  const getLocale = () => pickerLocale(ctx.get('locale', false))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'browser-use', order: 30, label: '浏览器自动化' }, () => <Section remote={remote} getLocale={getLocale} />))
}
