import { Card, Explain, Notice, Row, ScoreRing } from '../components/kit.jsx'
import { Bar } from '../components/charts.jsx'
import { Chip, ErrorState, PageHeader, Skeletons } from '../components/ui.jsx'
import { go, useApi } from '../lib/hooks.jsx'

const NAMES = { emergency: 'Emergency fund', debt: 'Debt load', savings: 'Savings rate', insurance: 'Insurance cover', diversification: 'Diversification', retirement: 'Retirement progress' }

export default function Wellness() {
  const w = useApi('/wellness'), b = useApi('/benchmarks')
  if (w.loading && !w.data) return <><PageHeader title="Wellness" /><Skeletons rows={2} h={220} /></>
  if (w.error) return <ErrorState message={w.message} onRetry={w.reload} />
  const d = w.data.wellness, learn = w.data.learnNext ?? []
  return (
    <>
      <PageHeader eyebrow="Financial health" title="Wellness score" sub="Six rules-of-thumb checks rolled into one number. It tells you where to look first, not how good a person you are with money." />
      {!d.ready ? <Notice tone="warn">Add a few details (income, expenses, assets) to unlock your score.</Notice> : (
        <div className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <Card className="grid place-items-center"><ScoreRing value={d.score} sub={d.band} size={190} />{d.weakest && <div className="mt-3 text-center text-xs text-muted">Weakest area: <b className="text-ink">{NAMES[d.weakest] ?? d.weakest}</b></div>}</Card>
            <Card title="Components" eyebrow={`${Math.round(d.coverage * 100)}% of data available`}>
              <div className="grid gap-4">{d.components.map(c => (
                <div key={c.key}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{NAMES[c.key] ?? c.key} <span className="text-faint">· weight {c.weight}</span></span><span className="t-num">{c.score}/100</span></div>
                  <Bar value={c.score / 100} height={6} color={c.score >= 70 ? 'var(--good)' : c.score >= 45 ? 'var(--amber)' : 'var(--rose)'} /><div className="mt-1 text-xs text-faint">{c.detail}</div></div>
              ))}</div>
            </Card>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Explain e={d.explain} />
            <Card title="Learn next" eyebrow="Matched to your weakest area">
              {learn.length ? learn.map(l => <Row key={l.id} label={<button className="text-left hover:underline" onClick={() => go(`/learn?id=${l.id}`)}>{l.title}</button>} value={<Chip>{l.topic}</Chip>} sub={l.reason} />) : <p className="text-sm text-muted">You have completed the suggested lessons.</p>}
            </Card>
          </div>
          <Card title="How you compare" eyebrow="Common rules of thumb">
            {b.data ? <>{b.data.rows.map(r => <Row key={r.key} label={r.label} value={<span className="flex items-center gap-2"><span className="t-num">{typeof r.yours === 'number' && r.yours <= 1 ? `${Math.round(r.yours * 100)}%` : r.yours}</span><Chip tone={r.ok ? 'good' : 'warn'}>{r.target}</Chip></span>} />)}
              <p className="mt-3 text-xs text-faint">{b.data.cohort?.available ? 'Cohort comparison is anonymous and only shown with 20+ opted-in users in your age band.' : b.data.cohort?.note}</p></> : <Skeletons rows={1} h={120} />}
          </Card>
        </div>
      )}
    </>
  )
}
