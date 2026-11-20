import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gavel, MessageSquareWarning, Send, Scale, Brain, Landmark, Target } from 'lucide-react'
import { EmptyPortfolio } from '../components/EmptyPortfolio.jsx'
import { Bar } from '../components/charts.jsx'
import { Button, Chip, Disclaimer, ErrorState, Glass, PageHeader, Skeletons, rise, stagger } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { useApi, useAuth, useToasts } from '../lib/hooks.jsx'

const ICON = { risk: Scale, behavior: Brain, tax: Landmark, goals: Target }
const STANCE = { support: ['good', 'Supports'], neutral: ['info', 'Neutral'], oppose: ['bad', 'Opposes'] }
const SUGGEST = ['Should I sell my crypto?', 'Should I buy more equity?', 'Am I too concentrated?', 'Should I rebalance?']

export default function Council() {
  const { invalidate, refresh } = useAuth(); const { push } = useToasts()
  const p = useApi('/portfolio'), hist = useApi('/council')
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  if (p.loading && !p.data) return <><PageHeader title="Advisory council" /><Skeletons rows={2} /></>
  if (p.error) return <ErrorState message={p.message} onRetry={p.reload} />
  if (p.data.empty) return <><PageHeader eyebrow="Multi-agent" title="Advisory council" /><EmptyPortfolio what="council debates" /></>

  const ask = async text => {
    const question = (text ?? q).trim(); if (!question) return
    setBusy(true); setRes(null)
    try {
      const r = await api.post('/council', { question }); setRes(r); invalidate(); refresh()
      r.unlocked?.forEach(u => push({ kind: 'success', title: `Unlocked: ${u.title}`, text: u.desc }))
    } catch (e) { push({ kind: 'error', text: errorMessage(e) }) } finally { setBusy(false) }
  }
  const mod = res?.moderator
  const past = (hist.data?.sessions ?? []).filter(s => s.id !== res?.id).slice(0, 4)

  return (
    <>
      <PageHeader eyebrow="Multi-agent" title="Advisory council" sub="Four specialists review your portfolio and your history. They won't always agree — and that's the point." />
      <Glass flat className="p-5">
        <form onSubmit={e => { e.preventDefault(); ask() }} className="flex flex-col gap-3 sm:flex-row">
          <input className="field flex-1" placeholder="Ask anything about your money — e.g. Should I sell my crypto?" maxLength={300} value={q} onChange={e => setQ(e.target.value)} aria-label="Question for the council" />
          <Button variant="primary" loading={busy} type="submit"><Send size={16} />Convene</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{SUGGEST.map(s => <button key={s} onClick={() => { setQ(s); ask(s) }} className="chip transition-colors hover:text-ink">{s}</button>)}</div>
      </Glass>

      {busy && <div className="mt-5"><Skeletons rows={2} h={140} /></div>}

      {res && (
        <motion.div className="mt-6" variants={stagger} initial="hidden" animate="show" key={res.id}>
          <motion.div variants={rise}>
            <Glass flat className="mb-4 p-6" style={{ borderColor: 'color-mix(in srgb, var(--a2) 40%, transparent)' }}>
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--a1), var(--a2))', color: '#fff' }}><Gavel size={22} /></div>
                <div className="flex-1">
                  <div className="t-eyebrow">Moderator · {mod.consensus}</div>
                  <p className="mt-1.5 text-[15px] leading-relaxed">{mod.summary}</p>
                </div>
              </div>
              {mod.dissent?.length > 0 && (
                <div className="mt-5 rounded-2xl p-4" style={{ background: 'color-mix(in srgb, var(--amber) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 28%, transparent)' }}>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber"><MessageSquareWarning size={15} />Where they disagree</div>
                  <ul className="grid gap-1.5 text-sm text-muted">{mod.dissent.map(d => <li key={d.agent}><b className="text-ink">{d.agent}</b> ({STANCE[d.stance]?.[1].toLowerCase()}): {d.because}</li>)}</ul>
                </div>
              )}
            </Glass>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2">
            {res.agents.map(a => {
              const I = ICON[a.id] ?? Scale; const [tone, label] = STANCE[a.stance] ?? STANCE.neutral
              return (
                <motion.div key={a.id} variants={rise}>
                  <Glass lift className="h-full p-5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--glass-a)' }}><I size={18} className="text-a3" /></div>
                      <div className="flex-1"><div className="text-sm font-semibold">{a.name}</div><div className="text-xs text-faint">{a.role}</div></div>
                      <Chip tone={tone}>{label}</Chip>
                    </div>
                    <p className="mt-4 text-[15px] font-medium leading-snug">{a.headline}</p>
                    <ul className="mt-3 grid gap-1.5 text-sm text-muted">{a.reasons.map(r => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current" />{r}</li>)}</ul>
                    {a.actions?.length > 0 && <ul className="mt-3 grid gap-1 text-xs text-a1">{a.actions.map(x => <li key={x}>→ {x}</li>)}</ul>}
                    <div className="mt-4 flex items-center gap-2 text-xs text-faint"><span>Confidence</span><div className="flex-1"><Bar value={a.confidence} height={4} color="var(--a2)" /></div><span className="t-num">{Math.round(a.confidence * 100)}%</span></div>
                  </Glass>
                </motion.div>
              )
            })}
          </div>
          <Disclaimer>{res.disclaimer}</Disclaimer>
        </motion.div>
      )}

      {!res && past.length > 0 && (
        <div className="mt-8"><div className="t-eyebrow mb-3">Recent sessions</div>
          <div className="grid gap-3">{past.map(s => <Glass key={s.id} lift className="cursor-pointer p-4" onClick={() => setQ(s.question)}><div className="text-sm font-medium">{s.question}</div><div className="mt-1 text-xs text-muted">{s.moderator?.summary}</div></Glass>)}</div>
        </div>
      )}
    </>
  )
}
