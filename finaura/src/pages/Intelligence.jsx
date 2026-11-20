import { useState } from 'react'
import { FanChart } from '../components/charts.jsx'
import { Card, Explain, Notice, Tabs, Row, useAction } from '../components/kit.jsx'
import { Button, Chip, ErrorState, Field, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const pc = x => `${Math.round((x ?? 0) * 100)}%`
const pts = b => b.map(x => ({ ...x, month: x.year * 12 }))
const tone = p => (p >= 0.85 ? 'good' : p >= 0.65 ? 'warn' : 'bad')

function LifeTwin() {
  const { money } = useAuth(), t = useApi('/twin/life')
  if (t.loading && !t.data) return <Skeletons rows={3} h={200} />
  if (t.error) return <ErrorState message={t.message} onRetry={t.reload} />
  const d = t.data, p = d.projection, r = d.readiness
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Net worth now" value={d.netWorthNow} format={money.compact} />
        <Stat label="Money lasts to 95" value={p.probabilityFundsLast * 100} format={v => `${Math.round(v)}%`} tone={tone(p.probabilityFundsLast) === 'good' ? 'good' : tone(p.probabilityFundsLast) === 'warn' ? 'warn' : 'bad'} />
        <Stat label="Investable at retirement" value={p.liquidAtRetirement} format={money.compact} sub={`age ${p.retirementAge}, future money`} />
        <Stat label="Median run-out age" value={p.medianDepletionAge ?? 0} format={v => (p.medianDepletionAge ? v.toFixed(0) : 'Never')} />
      </div>
      <Card title="Possible futures" eyebrow="Whole-life Monte Carlo">
        <FanChart a={pts(p.bands)} b={pts(p.bands)} height={300} fmt={money.compact} aName="Likely range" bName="Median" aColor="var(--a3)" bColor="var(--a2)" />
        <p className="mt-3 text-xs text-faint">Shaded band is the 10th–90th percentile across {p.paths} simulated paths. {d.state.assumed.length ? `Assumed because missing: ${d.state.assumed.join(', ')}.` : ''}</p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Explain e={r.explain} />
        <Card title="What moves the needle" eyebrow="Levers">
          {d.levers.map(l => <Row key={l.label} label={l.label} value={<Chip tone={l.delta > 0 ? 'good' : 'bad'}>{l.delta >= 0 ? '+' : ''}{Math.round(l.delta * 100)} pts → {pc(l.probabilityFundsLast)}</Chip>} />)}
        </Card>
      </div>
    </div>
  )
}

function WhatIf() {
  const { money } = useAuth(), cat = useApi('/whatif/catalog'), { run, busy } = useAction()
  const [picks, setPicks] = useState([]), [res, setRes] = useState(null)
  const add = s => setPicks(p => (p.length >= 4 || p.some(x => x.kind === s.kind) ? p : [...p, { kind: s.kind, label: s.label, params: Object.fromEntries(s.params.map(q => [q.name, q.default])), spec: s.params }]))
  const sim = async () => setRes(await run(() => api.post('/whatif', { picks: picks.map(({ kind, params }) => ({ kind, params })) }), { reload: false }))
  return (
    <div className="grid gap-5">
      <Card title="Pick up to four life events" eyebrow="What-if simulator">
        <div className="flex flex-wrap gap-2">{cat.data?.scenarios.map(s => <button key={s.kind} onClick={() => add(s)} className="chip" disabled={picks.some(x => x.kind === s.kind)}>+ {s.label}</button>)}</div>
        <div className="mt-4 grid gap-3">
          {picks.map(pk => (
            <div key={pk.kind} className="rounded-2xl border p-3" style={{ borderColor: 'var(--stroke)' }}>
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">{pk.label}<button className="text-faint hover:text-rose" onClick={() => setPicks(p => p.filter(x => x.kind !== pk.kind))}>Remove</button></div>
              <div className="grid gap-3 sm:grid-cols-3">{pk.spec.map(q => <Field key={q.name} label={q.label ?? q.name} type="number" min={q.min} max={q.max} value={pk.params[q.name]} onChange={e => setPicks(p => p.map(x => (x.kind === pk.kind ? { ...x, params: { ...x.params, [q.name]: Number(e.target.value) } } : x)))} />)}</div>
            </div>
          ))}
        </div>
        <Button variant="primary" className="mt-4" loading={busy} disabled={!picks.length} onClick={sim}>Run simulation</Button>
      </Card>
      {res && (
        <>
          <Card title="Baseline vs. your scenarios">
            <div className="grid gap-3">
              <Row label="Baseline" value={<Chip tone={tone(res.baseline.probabilityFundsLast)}>{pc(res.baseline.probabilityFundsLast)} money lasts</Chip>} />
              {res.scenarios.map(s => (
                <div key={s.kind} className="border-b pb-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}>
                  <Row label={s.title} value={<Chip tone={tone(s.result.probabilityFundsLast)}>{pc(s.result.probabilityFundsLast)} ({s.delta.probabilityFundsLast >= 0 ? '+' : ''}{Math.round(s.delta.probabilityFundsLast * 100)} pts)</Chip>} />
                  <div className="text-xs text-faint">Median final net worth {money.compact(s.delta.finalNetWorthMedian)} vs baseline · investable at retirement {money.compact(s.delta.liquidAtRetirement)}</div>
                </div>
              ))}
            </div>
          </Card>
          {res.scenarios[0] && <Card title={res.scenarios[0].title}><FanChart a={pts(res.baseline.bands)} b={pts(res.scenarios[0].result.bands)} fmt={money.compact} aName="Baseline" bName="With event" height={260} /></Card>}
          <Notice>Simulations use assumed returns and volatility and cannot predict the future. Treat percentages as a gauge.</Notice>
        </>
      )}
    </div>
  )
}

function Stress() {
  const { money } = useAuth(), s = useApi('/stress')
  if (s.loading && !s.data) return <Skeletons rows={3} h={120} />
  if (s.error) return <ErrorState message={s.message} onRetry={s.reload} />
  const d = s.data
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {d.scenarios.map(x => (
        <Card key={x.key} title={x.label} eyebrow="Stress test">
          <div className="t-num text-2xl font-bold" style={{ color: 'var(--rose)' }}>{money.compact(x.loss)} <span className="text-sm text-muted">({(x.lossPct * 100).toFixed(1)}%)</span></div>
          <div className="mt-2 text-xs text-faint">Assets {money.compact(x.assetsBefore)} → {money.compact(x.assetsAfter)} · net worth after {money.compact(x.netWorthAfter)}</div>
          <div className="mt-3 grid gap-1">{Object.entries(x.groups).filter(([, g]) => g.shock).map(([k, g]) => <Row key={k} label={k} value={`${Math.round(g.shock * 100)}%`} />)}</div>
        </Card>
      ))}
    </div>
  )
}

export default function Intelligence() {
  const [tab, setTab] = useState('life')
  return (
    <>
      <PageHeader eyebrow="Predictive twin" title="Simulator" sub="Your whole financial life, simulated thousands of ways. Explore events and shocks before they happen." />
      <Tabs tabs={[['life', 'Life twin'], ['whatif', 'What-if'], ['stress', 'Stress tests']]} value={tab} onChange={setTab} />
      {tab === 'life' && <LifeTwin />}{tab === 'whatif' && <WhatIf />}{tab === 'stress' && <Stress />}
    </>
  )
}
