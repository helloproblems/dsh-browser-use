import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

const NS = 'browser-use'
type SettingsValue = { headless: boolean; browserType: 'chrome'; browserUrl: string; autoDiscover: boolean }
type View = { value: SettingsValue; revision: number }
const row: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 320px)', gap: 20, alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--dsh-border-subtle)' }
const label: CSSProperties = { fontSize: 14, fontWeight: 600 }
const desc: CSSProperties = { marginTop: 4, fontSize: 12, color: 'var(--dsh-text-secondary)', lineHeight: 1.5 }
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', height: 34, border: '1px solid var(--dsh-border-default)', background: 'var(--dsh-bg-primary)', color: 'var(--dsh-text-primary)', padding: '0 10px', borderRadius: 6 }

function Toggle({ checked, onChange }: { checked: boolean; onChange(value: boolean): void }) {
  return <input type="checkbox" checked={checked} onChange={event => { onChange(event.target.checked) }} style={{ width: 18, height: 18, justifySelf: 'end' }} />
}

function Section({ remote }: { remote: any }) {
  const [view, setView] = useState<View | null>(null)
  const [draft, setDraft] = useState<SettingsValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void remote.settings.describe().then((answer: any) => {
      if (!answer.ok) throw new Error(answer.error.message)
      const found = answer.value.namespaces.find((item: any) => item.ns === NS)
      if (!found) throw new Error('浏览器自动化设置不可用')
      setView({ value: found.value, revision: found.revision }); setDraft(found.value)
    }).catch((cause: unknown) => { setError(String(cause)) })
  }, [])
  if (!draft || !view) return <div style={{ padding: '20px 0', color: 'var(--dsh-text-secondary)' }}>{error || '正在读取设置...'}</div>
  const save = async () => {
    setSaving(true); setError('')
    const answer = await remote.settings.replace(NS, draft, view.revision)
    setSaving(false)
    if (!answer.ok) { setError(answer.error.message); return }
    setView({ value: answer.value.value, revision: answer.value.revision }); setDraft(answer.value.value)
  }
  return <div style={{ maxWidth: 760 }}>
    <div style={row}><div><div style={label}>浏览器类型</div><div style={desc}>当前 backend 使用 Google Chrome；Edge backend 将在未来版本提供。</div></div><select value="chrome" disabled style={input}><option value="chrome">Chrome</option></select></div>
    <div style={row}><div><div style={label}>无头模式</div><div style={desc}>由 backend 启动浏览器时隐藏窗口。</div></div><Toggle checked={draft.headless} onChange={headless => { setDraft({ ...draft, headless }) }} /></div>
    <div style={row}><div><div style={label}>自动发现浏览器地址</div><div style={desc}>优先使用配置地址，然后检测 Chrome 活动端口和本机调试端口。</div></div><Toggle checked={draft.autoDiscover} onChange={autoDiscover => { setDraft({ ...draft, autoDiscover }) }} /></div>
    <div style={row}><div><div style={label}>浏览器地址</div><div style={desc}>远程调试 HTTP 地址，例如 http://127.0.0.1:9222。</div></div><input value={draft.browserUrl} placeholder="自动发现或由 backend 启动" style={input} onChange={event => { setDraft({ ...draft, browserUrl: event.target.value.trim() }) }} /></div>
    {error ? <p role="alert" style={{ color: 'var(--dsh-color-danger)', fontSize: 12 }}>{error}</p> : null}
    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}><Button disabled={saving} onClick={() => { void save() }}>{saving ? '正在保存...' : '保存'}</Button></div>
  </div>
}

export const inject = ['slots', 'remote', 'remote.settings']
export function apply(ctx: Context): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'browser-use', order: 30, label: '浏览器自动化' }, () => <Section remote={(ctx as any).remote} />))
}

