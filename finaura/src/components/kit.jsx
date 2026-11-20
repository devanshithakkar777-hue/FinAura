import { useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Bar, Ring } from './charts.jsx'
import { Button, Chip, Field, Glass, Modal, Segmented, cx } from './ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { useAuth, useToasts } from '../lib/hooks.jsx'

/** Run an async action with busy state, toast on error, optional success toast and data refresh. */
export function useAction() {
  const { invalidate, refresh } = useAuth(); const { push } = useToasts()
  const [busy, setBusy] = useState(false)
  const run = async (fn, { ok, reload = true, quiet } = {}) => {
    setBusy(true)
    try { const r = await fn(); if (ok) push({ kind: 'success', text: typeof ok === 'function' ? ok(r) : ok }); if (reload) { invalidate(); refresh() } return r }
    catch (e) { if (!quiet) push({ kind: 'error', text: errorMessage(e) }); return undefined } finally { setBusy(false) }
  }
  return { run, busy }
}

/** The "why" behind a recommendation: verdict, reasons, risks, alternatives and an honest confidence. */
export function Explain({ e, className }) {
  if (!e) return null
  return (
    <div className={cx('rounded-2xl p-4', className)} style={{ background: 'color-mix(in srgb, var(--a1) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--a1) 22%, transparent)' }}>
      <div className="flex items-start justify-between gap-3">
        <div><div className="t-eyebrow">Why this</div><div className="mt-1 text-sm font-semibold">{e.verdict}</div></div>
        {e.confidenceLabel && <Chip tone={e.confidenceLabel === 'high' ? 'good' : e.confidenceLabel === 'medium' ? 'warn' : 'bad'}>{e.confidenceLabel} confidence</Chip>}
      </div>
      {e.why?.length > 0 && <ul className="mt-3 grid gap-1 text-[13px] text-muted">{e.why.map(w => <li key={w} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current" />{w}</li>)}</ul>}
      {e.risks?.length > 0 && <div className="mt-3 text-[12px] text-amber"><b>Risks: </b>{e.risks.join(' · ')}</div>}
      {e.alternatives?.length > 0 && <div className="mt-1.5 text-[12px] text-muted"><b className="text-ink">Alternatives: </b>{e.alternatives.join(' · ')}</div>}
      {e.uncertainty && <div className="mt-1.5 text-[12px] text-faint">{e.uncertainty}</div>}
      {e.confidence != null && <div className="mt-3 flex items-center gap-2 text-xs text-faint"><span>Confidence</span><div className="flex-1"><Bar value={e.confidence} height={4} color="var(--a2)" /></div><span className="t-num">{Math.round(e.confidence * 100)}%</span></div>}
      {e.disclaimer && <div className="mt-2 text-[11px] text-faint">{e.disclaimer}</div>}
    </div>
  )
}

export function ScoreRing({ value, label, sub, size = 150 }) {
  return <Ring value={Math.max(0, Math.min(100, value ?? 0))} size={size} label={sub ?? label} />
}

export function Notice({ children, tone = 'info', icon }) {
  const c = { info: 'var(--a1)', warn: 'var(--amber)', good: 'var(--good)', bad: 'var(--rose)' }[tone]
  const I = icon ?? (tone === 'warn' || tone === 'bad' ? AlertTriangle : ShieldCheck)
  return (
    <div className="flex gap-3 rounded-2xl px-4 py-3 text-[13px] leading-relaxed text-muted" style={{ border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, background: `color-mix(in srgb, ${c} 7%, transparent)` }}>
      <I size={16} className="mt-0.5 shrink-0" style={{ color: c }} /><div>{children}</div>
    </div>
  )
}

export const Tabs = ({ tabs, value, onChange }) => <Segmented className="mb-6 max-w-full overflow-x-auto" options={tabs.map(t => ({ value: t[0], label: t[1] }))} value={value} onChange={onChange} />

export function Row({ label, value, sub }) {
  return <div className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-0" style={{ borderColor: 'color-mix(in srgb, var(--stroke) 70%, transparent)' }}><span className="text-muted">{label}{sub && <span className="ml-2 text-xs text-faint">{sub}</span>}</span><span className="t-num font-semibold">{value}</span></div>
}

export function Card({ title, eyebrow, actions, children, className, flat = true }) {
  return (
    <Glass flat={flat} className={cx('p-5 sm:p-6', className)}>
      {(title || actions) && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div>{eyebrow && <div className="t-eyebrow mb-1">{eyebrow}</div>}{title && <h3 className="t-display text-lg font-semibold">{title}</h3>}</div>{actions}</div>}
      {children}
    </Glass>
  )
}

/** Config-driven form in a modal. fields: [{k,label,type='text',options:[[value,label]],req,hint,step,min,max,def,textarea}] */
export function FormModal({ open, onClose, title, fields, onSubmit, submitLabel = 'Save', initial, wide }) {
  const blank = () => Object.fromEntries(fields.map(f => [f.k, initial?.[f.k] ?? f.def ?? (f.type === 'checkbox' ? false : '')]))
  const [v, setV] = useState(blank), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = k => e => setV(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { await onSubmit(v); setV(blank()); onClose() } catch (x) { setErr(errorMessage(x)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}>
      <form onSubmit={submit} className="grid gap-4">
        {fields.map(f => f.type === 'checkbox'
          ? <label key={f.k} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!v[f.k]} onChange={set(f.k)} className="h-4 w-4 accent-[var(--a1)]" /><span>{f.label}</span></label>
          : f.options
            ? <Field key={f.k} label={f.label} hint={f.hint}><select className="field" required={f.req} value={v[f.k]} onChange={set(f.k)}>{!f.noBlank && <option value="">Select…</option>}{f.options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</select></Field>
            : f.textarea
              ? <Field key={f.k} label={f.label} hint={f.hint}><textarea className="field" required={f.req} maxLength={f.max} value={v[f.k]} onChange={set(f.k)} placeholder={f.ph} /></Field>
              : <Field key={f.k} label={f.label} hint={f.hint} type={f.type ?? 'text'} required={f.req} step={f.step ?? (f.type === 'number' ? 'any' : undefined)} min={f.min} maxLength={f.max} placeholder={f.ph} value={v[f.k]} onChange={set(f.k)} />)}
        {err && <div role="alert" className="text-sm text-rose">{err}</div>}
        <Button variant="primary" size="lg" loading={busy} type="submit">{submitLabel}</Button>
      </form>
    </Modal>
  )
}

export const num = x => (x === '' || x == null ? undefined : Number(x))
export const numOr = (x, d = 0) => (x === '' || x == null ? d : Number(x))
export const delBtn = (onClick, label = 'Delete') => <button aria-label={label} onClick={onClick} className="rounded-lg p-1.5 text-faint hover:text-rose">×</button>
export { api }
