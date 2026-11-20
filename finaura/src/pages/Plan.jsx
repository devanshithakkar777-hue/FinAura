import { useState } from 'react'
import { Plus } from 'lucide-react'
import { LineArea } from '../components/charts.jsx'
import { Card, Explain, FormModal, Notice, Row, Tabs, delBtn, numOr, useAction } from '../components/kit.jsx'
import { Bar } from '../components/charts.jsx'
import { Button, Chip, ErrorState, Field, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const sevTone = s => (s === 'high' ? 'bad' : s === 'medium' ? 'warn' : 'good')

function Retirement() {
  const { money } = useAuth(), [sip, setSip] = useState(''), [age, setAge] = useState('')
  const q = new URLSearchParams(); if (sip) q.set('monthlySaving', sip); if (age) q.set('retirementAge', age)
  const r = useApi(`/plan/retirement?${q}`), proj = useApi(`/plan/projection?${sip ? `monthly=${sip}` : ''}`)
  if (r.loading && !r.data) return <Skeletons rows={2} h={180} />
  if (r.error) return <ErrorState message={r.message} onRetry={r.reload} />
  const p = r.data.plan
  if (!p.ready) return <Notice tone="warn">{p.reason ?? 'Add your age, retirement age and monthly expenses in Settings → Profile to plan retirement.'}</Notice>
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Corpus needed" value={p.corpusNeeded} format={money.compact} sub={`in ${p.years} years, future money`} />
        <Stat label="On track for" value={p.projectedCorpus} format={money.compact} />
        <Stat label="Readiness" value={p.readiness * 100} format={v => `${Math.round(v)}%`} tone={p.readiness >= 1 ? 'good' : p.readiness >= 0.6 ? 'warn' : 'bad'} />
        <Stat label="Monthly SIP needed" value={p.requiredMonthlySip} format={money.compact} />
      </div>
      <Card title="Try different numbers">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Monthly saving" type="number" min="0" value={sip} onChange={e => setSip(e.target.value)} placeholder="Use my goals" /><Field label="Retire at age" type="number" min="30" max="90" value={age} onChange={e => setAge(e.target.value)} placeholder="Use my profile" /></div>
      </Card>
      {proj.data && <Card title="Wealth projection" eyebrow={`${(proj.data.assumptions.rate * 100).toFixed(1)}% assumed return`}><LineArea labels={proj.data.points.map(x => `Y${x.year}`)} series={[{ name: 'Nominal', values: proj.data.points.map(x => x.nominal), color: 'var(--a3)' }, { name: "Today's money", values: proj.data.points.map(x => x.real), color: 'var(--a2)' }]} fmt={money.compact} /></Card>}
      <Explain e={p.explain} />
    </div>
  )
}

function Emergency() {
  const { money } = useAuth(), e = useApi('/plan/emergency')
  if (e.loading && !e.data) return <Skeletons rows={1} h={200} />
  if (e.error) return <ErrorState message={e.message} onRetry={e.reload} />
  const p = e.data.plan
  if (!p.ready) return <Notice tone="warn">{p.reason ?? 'Add monthly expenses to see your emergency fund target.'}</Notice>
  return (
    <div className="grid gap-5">
      <Card title={`${p.coverageMonths.toFixed(1)} of ${p.targetMonths} months covered`}>
        <Bar value={Math.min(1, p.coverageMonths / p.targetMonths)} height={10} color={p.status === 'covered' ? 'var(--good)' : 'var(--amber)'} />
        <div className="mt-4"><Row label="Monthly need (expenses + EMIs)" value={money.full(p.monthlyNeed)} /><Row label="Target" value={money.full(p.target)} /><Row label="Liquid today" value={money.full(p.liquid)} /><Row label="Gap" value={money.full(Math.max(0, p.gap))} /></div>
      </Card>
      <Explain e={p.explain} />
    </div>
  )
}

function Rebalance() {
  const { money } = useAuth(), [add, setAdd] = useState(''), r = useApi(`/plan/rebalance?newMoney=${add || 0}`), s = useApi('/signals')
  if (r.loading && !r.data) return <Skeletons rows={2} h={160} />
  if (r.error) return <ErrorState message={r.message} onRetry={r.reload} />
  const p = r.data.plan
  return (
    <div className="grid gap-5">
      {p.ready && <Card title="Allocation vs. target" eyebrow={`${p.riskProfile} reference mix`}>
        <div className="grid gap-3">{p.rows.map(x => <div key={x.group}><div className="mb-1 flex justify-between text-sm"><span>{x.group}</span><span className="t-num text-muted">{Math.round(x.weight * 100)}% now · {Math.round(x.target * 100)}% target</span></div><Bar value={x.weight} height={6} color={Math.abs(x.drift) > 0.1 ? 'var(--amber)' : 'var(--good)'} /></div>)}</div>
        <div className="mt-4 max-w-xs"><Field label="New money to invest" type="number" min="0" value={add} onChange={e => setAdd(e.target.value)} hint="See where fresh money should go instead of selling" /></div>
        {p.buyPlan.length > 0 && <div className="mt-3">{p.buyPlan.map(b => <Row key={b.group} label={`Put in ${b.group}`} value={money.full(b.amount)} />)}</div>}
      </Card>}
      {p.explain && <Explain e={p.explain} />}
      <Card title="Signals on your holdings" eyebrow="Momentum, trend & concentration">
        {s.data?.signals.length ? s.data.signals.map(x => <div key={x.symbol} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="flex items-center justify-between"><b>{x.name}</b><Chip tone={x.action === 'trim' ? 'warn' : x.action === 'add' ? 'good' : undefined}>{x.action}</Chip></div><Explain className="mt-2" e={x.explain} /></div>) : <p className="text-sm text-muted">Add market holdings in Portfolio to see signals.</p>}
        {s.data?.note && <p className="mt-3 text-xs text-faint">{s.data.note}</p>}
      </Card>
    </div>
  )
}

function Insurance() {
  const { money } = useAuth(), i = useApi('/insurance'), { run } = useAction(), [open, setOpen] = useState(false)
  if (i.loading && !i.data) return <Skeletons rows={2} h={140} />
  const a = i.data?.analysis
  return (
    <div className="grid gap-5">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Add policy</Button></div>
      {a?.gaps.map(g => <Card key={g.kind} title={`${g.kind === 'term' ? 'Life' : 'Health'} cover`} actions={<Chip tone={sevTone(g.severity)}>{g.severity} gap</Chip>}>
        <Row label="You have" value={money.full(g.have)} /><Row label="Rule-of-thumb need" value={money.full(g.need)} /><Row label="Gap" value={money.full(g.gap)} /><Explain className="mt-3" e={g.explain} /></Card>)}
      <Card title="Your policies">
        {i.data?.policies.length ? i.data.policies.map(p => <Row key={p.id} label={`${p.name} · ${p.insurer}`} sub={`${p.kind} · from ${p.startDate}`} value={<span className="flex items-center gap-2">{money.compact(p.sumAssured)} cover · {money.compact(p.annualPremium)}/yr{delBtn(() => run(() => api.del(`/insurance/${p.id}`), { ok: 'Removed' }))}</span>} />) : <p className="text-sm text-muted">No policies added.</p>}
      </Card>
      <FormModal open={open} onClose={() => setOpen(false)} title="Add an insurance policy" onSubmit={v => run(() => api.post('/insurance', { kind: v.kind, insurer: v.insurer, name: v.name, sumAssured: numOr(v.sumAssured), annualPremium: numOr(v.annualPremium), startDate: v.startDate, termYears: v.termYears ? Number(v.termYears) : undefined, familyFloater: !!v.familyFloater }), { ok: 'Added' })}
        fields={[{ k: 'kind', label: 'Type', options: ['term', 'life', 'health', 'motor', 'home', 'other'].map(x => [x, x]), noBlank: true, def: 'term' }, { k: 'insurer', label: 'Insurer', req: true }, { k: 'name', label: 'Plan name', req: true }, { k: 'sumAssured', label: 'Sum assured', type: 'number', req: true }, { k: 'annualPremium', label: 'Annual premium', type: 'number', req: true }, { k: 'startDate', label: 'Start date', type: 'date', req: true, def: today() }, { k: 'termYears', label: 'Term (years)', type: 'number' }, { k: 'familyFloater', label: 'Family floater', type: 'checkbox' }]} />
    </div>
  )
}

export default function Plan() {
  const [tab, setTab] = useState('retirement')
  return (
    <>
      <PageHeader eyebrow="Planning" title="Planning" sub="Retirement, emergency cover, rebalancing and insurance — each with its reasoning shown." />
      <Tabs tabs={[['retirement', 'Retirement'], ['emergency', 'Emergency fund'], ['rebalance', 'Rebalance & signals'], ['insurance', 'Insurance']]} value={tab} onChange={setTab} />
      {tab === 'retirement' && <Retirement />}{tab === 'emergency' && <Emergency />}{tab === 'rebalance' && <Rebalance />}{tab === 'insurance' && <Insurance />}
    </>
  )
}
