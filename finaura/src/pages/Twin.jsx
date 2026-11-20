import { useState } from 'react'
import { motion } from 'framer-motion'
import { Info, TrendingDown } from 'lucide-react'
import { EmptyPortfolio } from '../components/EmptyPortfolio.jsx'
import { FanChart } from '../components/charts.jsx'
import { Chip, Disclaimer, ErrorState, Glass, PageHeader, Segmented, Skeletons, Stat } from '../components/ui.jsx'
import { pct, pctPlain } from '../lib/format.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const SCEN = [['baseline', 'Normal'], ['crash', 'Sharp crash'], ['slow_bear', 'Slow bear'], ['crypto_winter', 'Crypto winter']]

export default function Twin() {
  const { money } = useAuth()
  const [scenario, setScenario] = useState('crash'), [years, setYears] = useState(10)
  const port = useApi('/portfolio')
  const t = useApi(`/twin?scenario=${scenario}&years=${years}`, { enabled: port.data ? !port.data.empty : false })
  if (port.loading && !port.data) return <><PageHeader title="Digital twin" /><Skeletons rows={2} h={260} /></>
  if (port.error) return <ErrorState message={port.message} onRetry={port.reload} />
  if (port.data.empty) return <><PageHeader eyebrow="Simulation" title="Digital twin" /><EmptyPortfolio what="digital twin" /></>
  const d = t.data

  return (
    <>
      <PageHeader eyebrow="Simulation" title="Your financial digital twin" sub="Two versions of you invest the same money through the same market. One sticks to the plan. One behaves like you have in the past." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented value={scenario} onChange={setScenario} options={SCEN.map(([value, label]) => ({ value, label }))} />
        <Segmented value={years} onChange={setYears} options={[5, 10, 20, 30].map(v => ({ value: v, label: `${v}y` }))} />
      </div>

      {t.error ? <ErrorState message={t.message} onRetry={t.reload} /> : !d ? <Skeletons rows={2} h={260} /> : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: t.loading ? .55 : 1 }} transition={{ duration: .25 }}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Disciplined you" value={d.disciplined.finalMedian} format={v => money.compact(v)} tone="good" sub={`Median after ${d.years} years`} animate={false} />
            <Stat label="Habit you" value={d.habit.finalMedian} format={v => money.compact(v)} tone="warn" sub="Median, with your behavior" animate={false} />
            <Stat label="Cost of habits" value={d.costOfHabits} format={v => (v >= 0 ? '−' : '+') + money.compact(Math.abs(v))} tone={d.costOfHabits > 0 ? 'bad' : 'good'} sub={`${pct(Math.abs(d.costOfHabitsPct))} of disciplined outcome`} animate={false} />
          </div>
          <Glass flat className="mt-4 p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><div className="t-eyebrow">{d.scenarioLabel}</div><div className="mt-1 text-sm text-muted">{d.paths} simulated paths · {money.full(d.monthlyContribution)}/month · starting at {money.compact(d.startValue)}</div></div>
              <div className="flex gap-3 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--a3)' }} />Disciplined</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: 'var(--rose)' }} />Your habits</span></div>
            </div>
            <FanChart a={d.disciplined.bands} b={d.habit.bands} fmt={v => money.compact(v)} />
          </Glass>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Glass flat className="p-5">
              <div className="t-eyebrow mb-3 flex items-center gap-2"><TrendingDown size={13} />Worst drawdown (median path)</div>
              <div className="flex items-end justify-between"><div><div className="t-display t-num text-2xl font-bold text-good">{pct(d.disciplined.maxDrawdown)}</div><div className="text-xs text-faint">Disciplined</div></div><div className="text-right"><div className="t-display t-num text-2xl font-bold text-amber">{pct(d.habit.maxDrawdown)}</div><div className="text-xs text-faint">Habit</div></div></div>
            </Glass>
            <Glass flat className="p-5">
              <div className="t-eyebrow mb-3">Your modelled habits {d.habits.derived ? <Chip className="ml-2">from your history</Chip> : <Chip className="ml-2">typical defaults</Chip>}</div>
              <ul className="grid gap-1.5 text-sm text-muted">
                <li>Panic-sell chance in a deep drop: <b className="text-ink">{pctPlain(d.habits.panicProb)}</b></li>
                <li>Triggered at about <b className="text-ink">{pctPlain(d.habits.panicThreshold)}</b> drawdown</li>
                <li>Re-enters after roughly <b className="text-ink">{d.habits.reentryMonths} months</b></li>
              </ul>
            </Glass>
          </div>
          <Glass flat className="mt-4 flex gap-3 p-4 text-xs leading-relaxed text-muted"><Info size={15} className="mt-0.5 shrink-0 text-a1" /><span>{d.assumptions}</span></Glass>
          <Disclaimer>Illustrative simulation. Not a forecast or a guarantee of future returns.</Disclaimer>
        </motion.div>
      )}
    </>
  )
}
