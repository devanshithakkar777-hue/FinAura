import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Compass, LineChart, FlaskConical, Gavel, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Bar } from '../components/charts.jsx'
import { Card, Explain, Notice, useAction } from '../components/kit.jsx'
import { Button, Chip, Glass, PageHeader, rise, stagger } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { go, useApi } from '../lib/hooks.jsx'

const ICON = { behaviour: Brain, portfolio: Compass, market: LineChart, simulation: FlaskConical }
const STANCE = { caution: ['bad', 'Caution'], support: ['good', 'Supports'], neutral: ['info', 'Neutral'] }
const VERDICT = { slow_down: 'Slow down', review: 'Review together', proceed_with_care: 'Proceed with care' }
const SUGGEST = ['Should I add more to crypto?', 'Am I too concentrated?', 'Is it a good time to rebalance?', 'Can I afford to retire early?']

export default function Council() {
  const [q, setQ] = useState(''), [res, setRes] = useState(null), { run, busy } = useAction(), [votes, setVotes] = useState({})
  const hist = useApi('/agents/council'), w = useApi('/agents/weights')
  const ask = async text => { const r = await run(() => api.post('/agents/council', { question: text || undefined }), { reload: false }); if (r) { setRes(r); setVotes({}); hist.reload?.() } }
  const vote = (agentId, v) => run(() => api.post(`/agents/council/${res.id}/feedback`, { agentId, vote: v }), { reload: false, ok: 'Noted — future panels will weigh this agent a little differently' }).then(r => r && setVotes(s => ({ ...s, [agentId]: v })))
  const a = res?.advisory
  return (
    <>
      <PageHeader eyebrow="Multi-agent advisory" title="The Council" sub="Four specialists reason independently from your data. A fifth weighs them, shows who disagrees, and learns from your feedback." />
      <Glass flat className="mb-6 p-5">
        <form onSubmit={e => { e.preventDefault(); ask(q.trim()) }} className="flex flex-col gap-3 sm:flex-row">
          <input className="field flex-1" placeholder="Ask the council anything about your money…" maxLength={500} value={q} onChange={e => setQ(e.target.value)} />
          <Button variant="primary" loading={busy} type="submit"><Send size={16} />Convene</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{SUGGEST.map(s => <button key={s} className="chip" onClick={() => { setQ(s); ask(s) }}>{s}</button>)}</div>
      </Glass>
      {res && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5">
          <motion.div variants={rise}><Glass className="p-6">
            <div className="flex flex-wrap items-center gap-3"><Gavel className="text-a2" /><span className="t-eyebrow">Advisory agent</span><Chip tone={STANCE[a.stance][0]}>{VERDICT[a.verdict]}</Chip></div>
            <h2 className="t-display mt-3 text-2xl font-bold">{a.headline}</h2>
            {a.summary && <p className="mt-2 text-sm text-muted">{a.summary}</p>}
            {a.dissent.length > 0 && <div className="mt-3 text-sm text-amber"><b>Disagreement: </b>{a.dissent.map(d => `${d.agent} (${d.stance})`).join(', ')}</div>}
            {a.actions.length > 0 && <ul className="mt-4 grid gap-1.5 text-sm">{a.actions.map(x => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-a3" />{x}</li>)}</ul>}
            <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={() => go(`/connect?q=${encodeURIComponent(res.question || 'Review my portfolio decision')}`)}>Ask a human expert</Button><span className="text-xs text-faint">You choose whether anything is shared.</span></div>
          </Glass></motion.div>
          <div className="grid gap-4 md:grid-cols-2">{res.agents.map(g => { const I = ICON[g.id], [tone, lab] = STANCE[g.stance]; return (
            <motion.div key={g.id} variants={rise}><Card>
              <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: 'var(--glass-a)' }}><I size={18} className="text-a1" /></div><div><div className="font-semibold">{g.name}</div><div className="text-xs text-faint">{g.role}</div></div></div><Chip tone={tone}>{lab}</Chip></div>
              <p className="mt-3 text-sm font-medium">{g.headline}</p>
              <ul className="mt-2 grid gap-1 text-[13px] text-muted">{g.reasons.map(r => <li key={r}>• {r}</li>)}</ul>
              <div className="mt-3 flex items-center gap-2 text-xs text-faint"><span>Confidence</span><div className="flex-1"><Bar value={g.confidence} height={4} /></div><span>{Math.round(g.confidence * 100)}%</span></div>
              <div className="mt-3 flex items-center gap-2"><span className="text-xs text-faint">Did this help?</span>
                <Button size="sm" variant={votes[g.id] === 'agree' ? 'primary' : 'ghost'} onClick={() => vote(g.id, 'agree')} aria-label="Agree"><ThumbsUp size={14} /></Button>
                <Button size="sm" variant={votes[g.id] === 'disagree' ? 'primary' : 'ghost'} onClick={() => vote(g.id, 'disagree')} aria-label="Disagree"><ThumbsDown size={14} /></Button></div>
            </Card></motion.div>) })}</div>
          <Explain e={a.explain} />
          <Notice>Educational analysis from the data you entered. Not licensed investment advice.</Notice>
        </motion.div>
      )}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card title="Past sessions">{hist.data?.sessions.length ? hist.data.sessions.slice(0, 8).map(s => <div key={s.id} className="border-b py-2.5 text-sm last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="font-medium">{s.question || 'General review'}</div><div className="text-xs text-faint">{VERDICT[s.verdict] ?? s.verdict} · {String(s.created_at).slice(0, 10)}</div></div>) : <p className="text-sm text-muted">No sessions yet.</p>}</Card>
        <Card title="How the agents have adapted to you" eyebrow="Weights move within 0.5–1.5">{w.data?.agents.map(g => <div key={g.id} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span>{g.name}</span><span className="t-num text-muted">×{(w.data.weights[g.id] ?? 1).toFixed(2)}</span></div><Bar value={((w.data.weights[g.id] ?? 1) - 0.5) / 1} height={5} /></div>)}</Card>
      </div>
    </>
  )
}
