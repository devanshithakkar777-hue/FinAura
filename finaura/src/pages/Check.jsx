import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check as CheckIcon, Clock, ShieldAlert, ShieldCheck, Hand, X, Receipt } from 'lucide-react'
import { EmptyPortfolio } from '../components/EmptyPortfolio.jsx'
import { Button, Chip, Disclaimer, ErrorState, Field, Glass, PageHeader, Segmented, Skeletons } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { go, useApi, useAuth, useToasts } from '../lib/hooks.jsx'
import { pct, pctPlain, todayISO } from '../lib/format.js'

const TONE = { low: ['good', 'Low risk', ShieldCheck, 'var(--good)'], medium: ['warn', 'Pause for a moment', ShieldAlert, 'var(--amber)'], high: ['bad', 'High emotional risk', ShieldAlert, 'var(--rose)'] }

export default function Check() {
  const { money, invalidate, refresh } = useAuth(); const { push } = useToasts()
  const p = useApi('/portfolio')
  const [f, setF] = useState({ symbol: '', side: 'sell', quantity: '' })
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [res, setRes] = useState(null)
  const [ticks, setTicks] = useState({}), [ack, setAck] = useState(false), [done, setDone] = useState(null)
  const positions = useMemo(() => p.data?.positions ?? [], [p.data])
  const pos = useMemo(() => positions.find(x => x.symbol === f.symbol), [positions, f.symbol])

  if (p.loading && !p.data) return <><PageHeader title="Check a trade" /><Skeletons rows={2} /></>
  if (p.error) return <ErrorState message={p.message} onRetry={p.reload} />
  if (p.data.empty) return <><PageHeader eyebrow="Pre-mortem" title="Check a trade" /><EmptyPortfolio what="trade checks" /></>

  const run = async e => {
    e.preventDefault(); setErr(''); setBusy(true); setRes(null); setTicks({}); setAck(false); setDone(null)
    try { setRes(await api.post('/premortem', { symbol: f.symbol, side: f.side, quantity: Number(f.quantity) })) } catch (x) { setErr(errorMessage(x)) } finally { setBusy(false) }
  }
  const resolve = async decision => {
    setBusy(true)
    try { await api.post(`/nudges/${res.id}/resolve`, { decision }); invalidate(); refresh(); setDone(decision) } catch (x) { push({ kind: 'error', text: errorMessage(x) }) } finally { setBusy(false) }
  }
  const proceed = async () => {
    setBusy(true)
    try {
      const r = await api.post('/transactions', { symbol: res.symbol, side: res.side, quantity: res.quantity, price: res.context.price, date: todayISO(), nudgeId: res.id, note: 'Logged after pre-mortem check' })
      invalidate(); refresh(); setDone('proceeded'); push({ kind: 'success', text: `Trade logged. +${r.xpAwarded} XP` })
    } catch (x) { push({ kind: 'error', text: errorMessage(x) }) } finally { setBusy(false) }
  }

  const [tone, title, Icon, color] = res ? TONE[res.riskLevel] ?? TONE.low : []
  const allTicked = res && res.checklist.every((_, i) => ticks[i])
  const needsAck = res && res.riskLevel === 'high'
  const canProceed = allTicked && (!needsAck || ack)

  return (
    <>
      <PageHeader eyebrow="Pre-mortem" title="Check a trade" sub="Describe the trade you're about to make. We'll show how similar moments played out for you — before you commit." />
      <div className="grid gap-5 lg:grid-cols-5">
        <Glass flat className="h-fit p-6 lg:col-span-2">
          <form onSubmit={run} className="grid gap-4">
            <Segmented value={f.side} onChange={v => setF({ ...f, side: v })} options={[{ value: 'sell', label: 'Sell' }, { value: 'buy', label: 'Buy' }]} />
            <Field label="Asset">
              <select className="field" required value={f.symbol} onChange={e => setF({ ...f, symbol: e.target.value })}>
                <option value="" disabled>Choose a holding…</option>
                {positions.map(x => <option key={x.symbol} value={x.symbol}>{x.name} ({x.symbol})</option>)}
              </select>
            </Field>
            <Field label="Quantity" type="number" step="any" min="0" required value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })}
              hint={pos ? `You hold ${pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} · now ${money.precise(pos.price)}` : undefined} />
            {err && <div role="alert" className="text-sm text-rose">{err}</div>}
            <Button variant="primary" size="lg" loading={busy && !res} type="submit">Run pre-mortem</Button>
          </form>
        </Glass>

        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {!res ? (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Glass flat className="grid place-items-center p-10 text-center text-sm text-muted" style={{ minHeight: 280 }}>
                  <div><ShieldCheck className="mx-auto mb-3 text-a3" size={30} /><p className="max-w-xs">Your result will appear here: risk level, evidence from your own history, and a short checklist.</p></div>
                </Glass>
              </motion.div>
            ) : done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}>
                <Glass flat className="p-10 text-center">
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full" style={{ background: 'color-mix(in srgb, var(--good) 15%, transparent)' }}><CheckIcon className="text-good" /></div>
                  <h2 className="t-display text-xl font-semibold">{done === 'proceeded' ? 'Trade logged' : done === 'waited' ? 'Good call — you paused' : 'Trade cancelled'}</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{done === 'proceeded' ? 'It is now part of your history, and the outcome will feed your behavioral score.' : 'We will track how this decision plays out and show you in your Behavior view.'}</p>
                  <div className="mt-6 flex justify-center gap-2"><Button onClick={() => { setRes(null); setDone(null) }}>Check another</Button><Button variant="primary" onClick={() => go('/behavior')}>See behavior</Button></div>
                </Glass>
              </motion.div>
            ) : (
              <motion.div key={res.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4">
                <Glass flat className="p-6" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, boxShadow: `0 0 60px -20px ${color}` }}>
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}><Icon size={24} /></div>
                    <div className="flex-1">
                      <Chip tone={tone}>{title}</Chip>
                      <h2 className="t-display mt-2 text-xl font-semibold leading-snug">{res.headline}</h2>
                      <p className="mt-1 text-xs text-faint">{res.side === 'sell' ? 'Selling' : 'Buying'} {res.quantity} × {res.symbol} ≈ {money.full(res.consequences.tradeValue)} · {pctPlain(res.consequences.fractionOfPosition)} of position</p>
                    </div>
                  </div>
                  {res.cooldownHours > 0 && (
                    <div className="mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--rose) 35%, transparent)', background: 'color-mix(in srgb, var(--rose) 8%, transparent)' }}>
                      <Clock size={18} className="text-rose" /><span><b>{res.cooldownHours}-hour cooldown suggested.</b> <span className="text-muted">Strong emotions fade. The market will still be there tomorrow.</span></span>
                    </div>
                  )}
                </Glass>

                {res.signals.length > 0 && (
                  <Glass flat className="p-6">
                    <div className="t-eyebrow mb-3">What we noticed</div>
                    <ul className="grid gap-3">{res.signals.map(s => (
                      <li key={s.key} className="rounded-2xl p-3.5" style={{ background: 'var(--glass-b)', border: '1px solid var(--stroke)' }}><div className="text-sm font-semibold">{s.label}</div><div className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</div></li>
                    ))}</ul>
                    {res.evidence.personal?.count > 0 && <div className="mt-4 text-xs text-faint">Your history: {res.evidence.personal.count} similar past sells, average {pct(res.evidence.personal.avgForward30)} one month later.</div>}
                  </Glass>
                )}

                <Glass flat className="p-6">
                  <div className="t-eyebrow mb-3">Before you decide</div>
                  <ul className="grid gap-2.5">{res.checklist.map((c, i) => (
                    <li key={c}><label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--a1)]" checked={!!ticks[i]} onChange={e => setTicks({ ...ticks, [i]: e.target.checked })} /><span className={ticks[i] ? 'text-ink' : 'text-muted'}>{c}</span></label></li>
                  ))}</ul>
                  {res.taxNote && <div className="mt-4 flex gap-2 text-xs text-faint"><Receipt size={14} className="mt-0.5 shrink-0" />{res.taxNote}</div>}
                  {needsAck && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm" style={{ background: 'color-mix(in srgb, var(--rose) 7%, transparent)' }}><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--rose)]" checked={ack} onChange={e => setAck(e.target.checked)} /><span>I've read the warnings and still want to proceed.</span></label>}
                </Glass>

                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy} onClick={() => resolve('waited')}><Hand size={16} />I'll wait</Button>
                  <Button loading={busy} onClick={() => resolve('cancelled')}><X size={16} />Cancel trade</Button>
                  <Button disabled={!canProceed || busy} onClick={proceed} title={canProceed ? '' : 'Tick every checklist item first'}>Proceed & log</Button>
                </div>
                <Disclaimer>{res.disclaimer}</Disclaimer>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
