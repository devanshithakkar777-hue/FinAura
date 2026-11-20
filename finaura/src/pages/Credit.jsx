import { useState } from 'react'
import { Card, Explain, Notice, Row, Tabs, numOr, useAction } from '../components/kit.jsx'
import { Button, Chip, ErrorState, Field, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

function Health() {
  const { money } = useAuth(), c = useApi('/credit'), { run, busy } = useAction()
  const [score, setScore] = useState(''), [p, setP] = useState(null)
  if (c.loading && !c.data) return <Skeletons rows={2} h={160} />
  if (c.error) return <ErrorState message={c.message} onRetry={c.reload} />
  const h = c.data.health, prof = p ?? c.data.profile ?? {}
  const K = [['totalLimit', 'Total card limit'], ['utilised', 'Currently used'], ['enquiries6m', 'Loan enquiries (6 mo)'], ['missedPayments12m', 'Missed payments (12 mo)'], ['oldestAccountYears', 'Oldest account (years)']]
  return (
    <div className="grid gap-5">
      <Notice>Credit scores are entered by you from a bureau report. FinAura is not connected to any credit bureau.</Notice>
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Score" value={h.latestScore ?? 0} format={v => (h.latestScore ? Math.round(v) : '—')} sub={h.scoreBand ?? 'not entered'} /><Stat label="Utilisation" value={(h.utilisation ?? 0) * 100} format={v => (h.utilisation == null ? '—' : `${Math.round(v)}%`)} tone={h.utilisationStatus === 'high' ? 'bad' : undefined} /><Stat label="Debt-to-income" value={h.debtToIncome * 100} format={v => `${Math.round(v)}%`} sub={h.dtiStatus} /><Stat label="Monthly EMI" value={c.data.monthlyEmi} format={money.compact} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Explain e={h.explain} />
        <Card title="Factors">{h.factors.map(f => <Row key={f.name} label={f.name} value={<Chip tone={f.status === 'good' ? 'good' : f.status === 'poor' ? 'bad' : undefined}>{f.status}</Chip>} />)}</Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Log a score"><div className="flex items-end gap-3"><div className="flex-1"><Field label="Score (300–900)" type="number" min="300" max="900" value={score} onChange={e => setScore(e.target.value)} /></div><Button variant="primary" loading={busy} disabled={!score} onClick={() => run(() => api.post('/credit/scores', { score: Number(score) }), { ok: 'Logged' }).then(() => setScore(''))}>Save</Button></div></Card>
        <Card title="Your credit profile" actions={<Button size="sm" loading={busy} onClick={() => run(() => api.put('/credit/profile', Object.fromEntries(K.map(([k]) => [k, prof[k] === '' || prof[k] == null ? null : Number(prof[k])]))), { ok: 'Saved' })}>Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">{K.map(([k, l]) => <Field key={k} label={l} type="number" min="0" value={prof[k] ?? ''} onChange={e => setP({ ...prof, [k]: e.target.value })} />)}</div>
        </Card>
      </div>
    </div>
  )
}

function Tools() {
  const { money } = useAuth(), [rate, setRate] = useState(9), [yrs, setYrs] = useState(20), [pr, setPr] = useState(500000), [er, setEr] = useState(12), [extra, setExtra] = useState(0)
  const [bt, setBt] = useState({ outstanding: 3500000, currentRate: 8.6, newRate: 8, remainingMonths: 150, feePct: 0.5 })
  const aff = useApi(`/credit/affordability?rate=${rate || 9}&years=${yrs || 20}`), emi = useApi(`/credit/emi-options?principal=${pr || 1000}&rate=${er || 1}`)
  const trans = useApi(`/credit/transfer?${new URLSearchParams(Object.entries(bt).map(([k, v]) => [k, numOr(v, 1)]))}`), str = useApi(`/credit/strategies?extra=${extra || 0}`)
  return (
    <div className="grid gap-5">
      <Card title="How much loan can you afford?"><div className="grid gap-3 sm:grid-cols-2"><Field label="Rate %" type="number" value={rate} onChange={e => setRate(e.target.value)} /><Field label="Years" type="number" value={yrs} onChange={e => setYrs(e.target.value)} /></div>
        {aff.data?.ready && <div className="mt-4"><Row label="Comfortable (35% of take-home)" value={`${money.full(aff.data.comfortable.maxLoan)} · EMI ${money.full(aff.data.comfortable.maxEmi)}`} /><Row label="Stretch (45%)" value={`${money.full(aff.data.stretch.maxLoan)} · EMI ${money.full(aff.data.stretch.maxEmi)}`} /><Explain className="mt-3" e={aff.data.explain} /></div>}</Card>
      <Card title="EMI options"><div className="grid gap-3 sm:grid-cols-2"><Field label="Amount" type="number" value={pr} onChange={e => setPr(e.target.value)} /><Field label="Rate %" type="number" value={er} onChange={e => setEr(e.target.value)} /></div>
        {emi.data?.options && <div className="mt-4">{emi.data.options.map(o => <Row key={o.years} label={`${o.years} years`} sub={`interest ${money.compact(o.totalInterest)}`} value={`${money.full(o.emi)}/mo${o.emiShareOfTakeHome != null ? ` · ${Math.round(o.emiShareOfTakeHome * 100)}% of take-home` : ''}`} />)}{emi.data.suggestion && <p className="mt-2 text-xs text-muted">{emi.data.suggestion.why}</p>}</div>}</Card>
      <Card title="Is a balance transfer worth it?"><div className="grid gap-3 sm:grid-cols-3">{[['outstanding', 'Outstanding'], ['currentRate', 'Current rate %'], ['newRate', 'New rate %'], ['remainingMonths', 'Months left'], ['feePct', 'Fee %']].map(([k, l]) => <Field key={k} label={l} type="number" value={bt[k]} onChange={e => setBt({ ...bt, [k]: e.target.value })} />)}</div>
        {trans.data?.netSaving != null && <div className="mt-4"><Row label="Interest now → new" value={`${money.compact(trans.data.interestNow)} → ${money.compact(trans.data.interestNew)}`} /><Row label="Fee" value={money.full(trans.data.fee)} /><Row label="Net saving" value={<Chip tone={trans.data.worthIt ? 'good' : 'bad'}>{money.full(trans.data.netSaving)} · {trans.data.worthIt ? 'worth it' : 'not worth it'}</Chip>} /></div>}</Card>
      <Card title="Debt payoff: avalanche vs snowball"><Field label="Extra per month" type="number" min="0" value={extra} onChange={e => setExtra(e.target.value)} />
        {str.data?.ready && <div className="mt-4 grid gap-4 sm:grid-cols-2">{['avalanche', 'snowball'].map(k => <div key={k}><div className="t-eyebrow mb-1">{k}</div><Row label="Debt-free in" value={`${str.data[k].monthsToDebtFree} months`} /><Row label="Total interest" value={money.compact(str.data[k].totalInterest)} /></div>)}</div>}</Card>
    </div>
  )
}

export default function Credit() {
  const [tab, setTab] = useState('health')
  return (
    <>
      <PageHeader eyebrow="Credit IQ" title="Credit" sub="Track your score by hand, see what drives it, and test borrowing decisions before you make them." />
      <Tabs tabs={[['health', 'Credit health'], ['tools', 'Borrowing tools']]} value={tab} onChange={setTab} />
      {tab === 'health' ? <Health /> : <Tools />}
    </>
  )
}
