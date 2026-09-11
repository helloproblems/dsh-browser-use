/** Browser settings section mounted in the DSH Client. */
import type { RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useState, type CSSProperties } from 'react'
import { Button, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

import { browserPathError, readSettings, type BrowserType, type SettingsValue } from './settings.ts'

const NS = 'browser-use'
const PICKER_ENDPOINT = '/browser-use/pick-browser-executable'
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
const control: CSSProperties = { width: '100%', justifySelf: 'stretch' }
const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 34,
  border: '1px solid var(--dsw-alias-border-l2, var(--dsh-border-default))',
  background: 'var(--dsw-alias-bg-base, var(--dsh-bg-primary))',
  color: 'var(--dsw-alias-label-primary, var(--dsh-text-primary))',
  padding: '0 10px',
  borderRadius: 6,
}

function Switch({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label="无头模式"
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

function Section({ remote }: { remote: SettingsRemote }) {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<SettingsValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
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
    return () => { active = false }
  }, [remote])
  if (!draft || !view) {
    return <div style={{ padding: '20px 0', color: 'var(--dsw-alias-label-secondary, var(--dsh-text-secondary))' }}>{error || '正在读取设置...'}</div>
  }
  const validationError = browserPathError(draft)
  const save = async () => {
    if (browserPathError(draft)) return
    setSaving(true)
    setError('')
    try {
      const next = { ...draft, browserPath: draft.browserPath.trim() }
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
  const pickBrowser = async () => {
    setPicking(true)
    setError('')
    try {
      const query = new URLSearchParams({ browserType: draft.browserType, initialPath: draft.browserPath.trim() })
      const response = await fetch(`${PICKER_ENDPOINT}?${query}`, {
        method: 'POST',
        headers: { [PICKER_HEADER]: '1' },
      })
      const answer = await response.json() as { path?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof answer.error === 'string' ? answer.error : '浏览器文件选择失败')
      if (typeof answer.path === 'string') {
        const browserPath = answer.path
        setDraft(current => current ? { ...current, browserPath } : current)
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPicking(false)
    }
  }
  return <div style={{ maxWidth: 760 }}>
    <div style={row}>
      <div><div style={label}>浏览器类型</div><div style={desc}>保存后切换浏览器，无需重启；旧浏览器会话将被释放。</div></div>
      <select
        aria-label="浏览器类型"
        value={draft.browserType}
        style={{ ...input, ...control }}
        disabled={saving || picking}
        onChange={event => { setDraft({ ...draft, browserType: event.target.value as BrowserType }) }}
      >
        <option value="chrome">Google Chrome</option>
        <option value="edge">Microsoft Edge</option>
      </select>
    </div>
    <div style={row}>
      <div><div style={label}>无头模式</div><div style={desc}>由后端启动浏览器时不显示浏览器窗口。</div></div>
      <div style={{ ...control, display: 'flex', justifyContent: 'flex-end' }}>
        <Switch checked={draft.headless} onChange={headless => { setDraft({ ...draft, headless }) }} />
      </div>
    </div>
    <div style={row}>
      <div><div style={label}>浏览器位置</div><div style={desc}>留空时自动检索所选浏览器，也可手动指定。</div></div>
      <div style={{ ...control, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
        <input
          aria-label="浏览器位置"
          value={draft.browserPath}
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'browser-path-error' : undefined}
          placeholder="自动检索所选浏览器"
          style={input}
          onChange={event => { setDraft({ ...draft, browserPath: event.target.value }) }}
        />
        <Button
          variant="outline"
          size="sm"
          icon={<IconFolderOpenOutline16 />}
          disabled={picking || saving}
          title="选择浏览器文件"
          style={{ height: 34, whiteSpace: 'nowrap' }}
          onClick={() => { void pickBrowser() }}
        >
          {picking ? '选择中...' : '选择'}
        </Button>
      </div>
    </div>
    {validationError ? <p id="browser-path-error" role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{validationError}</p> : null}
    {error ? <p role="alert" style={{ color: 'var(--dsh-color-danger, #c93c37)', fontSize: 12 }}>{error}</p> : null}
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}>
      <Button variant="primary" disabled={saving || picking || !!validationError} onClick={() => { void save() }}>{saving ? '正在保存...' : '保存'}</Button>
    </div>
  </div>
}

export const inject = ['slots', 'remote', 'remote.settings']
export function apply(ctx: Context): void {
  // Guarded context service reads can return a new proxy on every render.
  const remote = ctx.remote
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'browser-use', order: 30, label: '浏览器自动化' }, () => <Section remote={remote} />))
}
