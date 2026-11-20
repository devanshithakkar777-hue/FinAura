import { useState } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import { Card, Notice, Row, Tabs, useAction } from '../components/kit.jsx'
import { Bar } from '../components/charts.jsx'
import { Button, Chip, ErrorState, Glass, PageHeader, Skeletons } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { go, useApi, useRoute } from '../lib/hooks.jsx'
import { Plus } from 'lucide-react'
import { FormModal } from '../components/kit.jsx'

function Lesson({ id, onBack }) {
  const l = useApi(`/learn/${id}`), { run, busy } = useAction(), [pick, setPick] = useState(null), [res, setRes] = useState(null)
  if (l.loading && !l.data) return <Skeletons rows={2} h={160} />
  if (l.error) return <ErrorState message={l.message} onRetry={l.reload} />
  const d = l.data
  return (
    <div className="grid gap-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} />All lessons</button>
      <Glass flat className="p-6"><div className="t-eyebrow mb-2">{d.minutes} min read</div><h2 className="t-display mb-4 text-2xl font-bold">{d.title}</h2><div className="grid gap-3 text-[15px] leading-relaxed text-muted">{d.body.map((p, i) => <p key={i}>{p}</p>)}</div></Glass>
      <Card title="Check yourself"><p className="mb-3 text-sm font-medium">{d.quiz.q}</p>
        <div className="grid gap-2">{d.quiz.options.map((o, i) => { const done = res != null, right = done && i === res.correctChoice, wrong = done && pick === i && !res.correct
          return <button key={o} disabled={done} onClick={() => setPick(i)} className="rounded-2xl border px-4 py-3 text-left text-sm transition-colors" style={{ borderColor: right ? 'var(--good)' : wrong ? 'var(--rose)' : pick === i ? 'var(--a1)' : 'var(--stroke)', background: right ? 'color-mix(in srgb, var(--good) 10%, transparent)' : undefined }}>{o}</button> })}</div>
        {!res ? <Button className="mt-4" variant="primary" loading={busy} disabled={pick == null} onClick={async () => setRes(await run(() => api.post(`/learn/${id}/answer`, { choice: pick }), { ok: r => (r.correct ? (r.xp ? `Correct! +${r.xp} XP` : 'Correct!') : 'Not quite — have another look') }))}>Check answer</Button>
          : <div className="mt-4 text-sm">{res.correct ? <span className="text-good">Correct.</span> : <span className="text-amber">The answer is highlighted above. You can read the lesson again and retry.</span>} <Button size="sm" className="ml-2" onClick={onBack}>Done</Button></div>}
      </Card>
    </div>
  )
}

function Lessons() {
  const l = useApi('/learn'), { params } = useRoute(), [open, setOpen] = useState(params.id ?? null)
  if (open) return <Lesson key={open} id={open} onBack={() => { setOpen(null); go('/learn'); l.reload() }} />
  if (l.loading && !l.data) return <Skeletons rows={3} h={70} />
  if (l.error) return <ErrorState message={l.message} onRetry={l.reload} />
  const done = l.data.lessons.filter(x => x.done).length
  return (
    <div className="grid gap-5">
      <Card title={`${done} of ${l.data.lessons.length} complete`}><Bar value={done / l.data.lessons.length} height={7} />{l.data.next.length > 0 && <div className="mt-4 text-sm text-muted">Suggested next: {l.data.next.map(n => <button key={n.id} className="chip mr-2" onClick={() => setOpen(n.id)}>{n.title}</button>)}</div>}</Card>
      <div className="grid gap-3 sm:grid-cols-2">{l.data.lessons.map(x => <button key={x.id} onClick={() => setOpen(x.id)} className="text-left"><Glass lift flat className="p-5"><div className="flex items-start justify-between"><div><div className="font-semibold">{x.title}</div><div className="mt-1 text-xs text-faint">{x.minutes} min · {x.topic}</div></div>{x.done ? <Chip tone="good"><Check size={12} />done</Chip> : null}</div></Glass></button>)}</div>
    </div>
  )
}

function Lab() {
  const lab = useApi('/psych/lab'), prof = useApi('/psych/profile'), { run } = useAction(), [fb, setFb] = useState({})
  if (lab.loading && !lab.data) return <Skeletons rows={3} h={100} />
  if (lab.error) return <ErrorState message={lab.message} onRetry={lab.reload} />
  const next = lab.data.exercises.find(e => !e.answered && !fb[e.id]) 
  return (
    <div className="grid gap-5">
      <Notice>These exercises show awareness of common biases. They do not predict how you will act with real money.</Notice>
      {next ? <Card title="Next exercise" eyebrow={next.bias.replace('_', ' ')}><p className="mb-3 text-sm font-medium">{next.q}</p><div className="grid gap-2">{next.options.map((o, i) => <button key={o} className="rounded-2xl border px-4 py-3 text-left text-sm hover:border-[var(--a1)]" style={{ borderColor: 'var(--stroke)' }} onClick={async () => { const r = await run(() => api.post('/psych/lab/answer', { exerciseId: next.id, choice: i }), { reload: false }); if (r) { setFb(s => ({ ...s, [next.id]: r })); prof.reload() } }}>{o}</button>)}</div></Card> : <Card><p className="text-sm text-muted">You have answered every exercise. Your profile below is up to date.</p></Card>}
      {Object.entries(fb).slice(-1).map(([id, r]) => <Notice key={id} tone={r.correct ? 'good' : 'warn'}><b>{r.correct ? 'Good call. ' : 'Common trap. '}</b>{r.why}{r.xp ? ` (+${r.xp} XP)` : ''} <button className="ml-2 underline" onClick={() => setFb(s => { const n = { ...s }; delete n[id]; n[`${id}-seen`] = r; return n })}>Next</button></Notice>)}
      {prof.data && <Card title="Your bias profile">{prof.data.rows.map(r => <Row key={r.bias} label={r.label} value={r.answered ? `${Math.round((r.accuracy ?? 0) * 100)}% · ${r.answered} answered` : '—'} />)}
        {prof.data.fromTrades.length > 0 && <div className="mt-3"><div className="t-eyebrow mb-1">Seen in your actual trades</div>{prof.data.fromTrades.map(t => <p key={t.label} className="text-sm text-muted"><b className="text-ink">{t.label}:</b> {t.detail}</p>)}</div>}</Card>}
    </div>
  )
}

function Events() {
  const e = useApi('/life-events'), { run } = useAction(), [open, setOpen] = useState(false), [sel, setSel] = useState(null)
  const plan = useApi(`/life-events/${sel}/plan`, { enabled: !!sel })
  return (
    <div className="grid gap-5">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Plan a life event</Button></div>
      {e.data?.mine.length === 0 && <Card><p className="text-sm text-muted">Marriage, a child, a home, a career break — add one to get a checklist and ideas for what to simulate.</p></Card>}
      {e.data?.mine.map(m => <Card key={m.id} title={e.data.catalog.find(c => c.kind === m.kind)?.label ?? m.kind} actions={<div className="flex gap-2"><Button size="sm" onClick={() => setSel(sel === m.id ? null : m.id)}>{sel === m.id ? 'Hide' : 'View plan'}</Button><Button size="sm" variant="danger" onClick={() => run(() => api.del(`/life-events/${m.id}`), { reload: false }).then(() => { setSel(null); e.reload() })}>Remove</Button></div>}>
        <div className="text-xs text-faint">{m.plannedOn ? `Planned ${String(m.plannedOn).slice(0, 10)}` : 'No date set'}{m.note ? ` · ${m.note}` : ''}</div>
        {sel === m.id && plan.data && <div className="mt-4 grid gap-3"><ul className="grid gap-1.5 text-sm">{plan.data.checklist.map(c => <li key={c} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-a3" />{c}</li>)}</ul>
          {plan.data.suggestedWhatIfs.length > 0 && <div className="text-sm text-muted">Simulate: {plan.data.suggestedWhatIfs.map(s => <button key={s.id} className="chip mr-2" onClick={() => go('/intelligence')}>{s.label}</button>)}</div>}</div>}
      </Card>)}
      <FormModal open={open} onClose={() => setOpen(false)} title="Plan a life event" onSubmit={v => run(() => api.post('/life-events', { kind: v.kind, plannedOn: v.plannedOn || null, note: v.note || null }), { ok: 'Added', reload: false }).then(() => e.reload())}
        fields={[{ k: 'kind', label: 'Event', options: (e.data?.catalog ?? []).map(c => [c.kind, c.label]), req: true }, { k: 'plannedOn', label: 'When (optional)', type: 'date', def: '' }, { k: 'note', label: 'Note', max: 200 }]} />
    </div>
  )
}

export default function Learn() {
  const { params } = useRoute(), [tab, setTab] = useState('lessons')
  return (
    <>
      <PageHeader eyebrow="Learn IQ" title="Learn" sub="Short lessons matched to your weakest area, a lab to spot your own biases, and planning for the big life moments." />
      <Tabs tabs={[['lessons', 'Lessons'], ['lab', 'Psychology lab'], ['events', 'Life events']]} value={params.id ? 'lessons' : tab} onChange={setTab} />
      {(params.id || tab === 'lessons') && <Lessons />}{!params.id && tab === 'lab' && <Lab />}{!params.id && tab === 'events' && <Events />}
    </>
  )
}
