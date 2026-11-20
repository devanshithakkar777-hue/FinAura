import { motion } from 'framer-motion'
import { TrendingUp, Wallet, Brain, ShieldAlert, Users, Orbit, ArrowUpRight, Heart } from 'lucide-react'
import { EmptyPortfolio } from '../components/EmptyPortfolio.jsx'
import { Donut, LineArea, Ring, Bar } from '../components/charts.jsx'
import { Chip, ErrorState, Glass, PageHeader, Skeletons, Stat, rise, stagger } from '../components/ui.jsx'
import { CLASS_COLOR, CLASS_LABEL, monthLabel, pct, pctPlain } from '../lib/format.js'
import { go, useApi, useAuth } from '../lib/hooks.jsx'

const QUICK = [
  { to: '/check', t: 'Check a trade', d: 'Pre-mortem before you click', icon: ShieldAlert },
  { to: '/council', t: 'Ask the council', d: 'Four agents, one question', icon: Users },
  { to: '/twin', t: 'Run your twin', d: 'Stress-test your future', icon: Orbit },
]

export default function Dashboard() {
  const { user, money } = useAuth()
  const p = useApi('/portfolio'), b = useApi('/behavior')
  if (p.loading && !p.data) return <><PageHeader title="Overview" /><Skeletons rows={3} h={150} /></>
  if (p.error) return <ErrorState message={p.message} onRetry={p.reload} />
  const d = p.data
  const hello = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  if (d.empty) return <><PageHeader eyebrow={hello} title={`Welcome, ${user.name.split(' ')[0]}`} sub="Let's put your portfolio under the microscope." /><EmptyPortfolio /></>

  const gain = d.totals.unrealised, gainPct = d.totals.costBasis ? gain / d.totals.costBasis : 0
  const alpha = b.data?.status === 'ok' ? b.data.alpha : null
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader eyebrow={hello} title={user.name.split(' ')[0]} sub={d.dataQuality === 'synthetic' ? 'You are viewing synthetic demo data — nothing here is real market data.' : undefined}
        actions={d.dataQuality === 'synthetic' ? <Chip tone="warn">Demo data</Chip> : null} />

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={rise} className="lg:col-span-2">
          <Glass className="h-full p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="t-eyebrow">Net worth</div>
                <div className="t-display t-num mt-2 text-[40px] font-bold leading-none sm:text-[52px]">{money.full(d.totals.value)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={gain >= 0 ? 'good' : 'bad'}><TrendingUp size={12} />{gain >= 0 ? '+' : '−'}{money.full(Math.abs(gain))} · {pct(gainPct)}</Chip>
                  <span className="text-xs text-faint">unrealised</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              {d.history.length > 2 && <LineArea labels={d.history.map(h => h.day)} labelFmt={monthLabel} fmt={v => money.full(v)}
                series={[{ key: 'value', name: 'Value', color: 'var(--a3)', values: d.history.map(h => h.value) }, { key: 'contributed', name: 'Invested', color: 'var(--a1)', values: d.history.map(h => h.contributed), dashed: true, area: false }]} />}
            </div>
          </Glass>
        </motion.div>

        <motion.div variants={rise}>
          <Glass className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="t-eyebrow mb-4 flex items-center gap-2"><Heart size={13} />Portfolio health</div>
            <Ring value={d.health.total} size={168} label="of 100" />
            <div className="mt-5 grid w-full gap-2.5 text-left text-xs">
              {[['Diversification', d.health.diversification], ['Volatility', d.health.volatility], ['Risk alignment', d.health.riskAlignment]].map(([k, v]) => (
                <div key={k}><div className="mb-1 flex justify-between text-muted"><span>{k}</span><span className="t-num">{v}</span></div><Bar value={v / 100} color="var(--a1)" height={4} /></div>
              ))}
            </div>
          </Glass>
        </motion.div>

        <motion.div variants={rise} className="lg:col-span-1">
          <Glass lift className="h-full cursor-pointer p-6" onClick={() => go('/behavior')}>
            <div className="flex items-center justify-between"><span className="t-eyebrow flex items-center gap-2"><Brain size={13} />Behavioral Alpha</span><ArrowUpRight size={16} className="text-faint" /></div>
            {alpha ? (
              <>
                <div className="t-display t-num mt-4 text-[34px] font-bold leading-none" style={{ color: alpha.amount >= 0 ? 'var(--good)' : 'var(--rose)' }}>{alpha.amount >= 0 ? '+' : '−'}{money.compact(Math.abs(alpha.amount))}</div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{alpha.amount >= 0 ? 'Your selling decisions added value versus never selling.' : 'Versus a version of you who never sold, your sells cost this much so far.'}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-faint">Behavior score <b className="t-num text-ink">{b.data.score}</b>/100</div>
              </>
            ) : <p className="mt-4 text-sm text-muted">{b.loading ? 'Analysing…' : 'Log a few more trades and your behavioral alpha will appear here.'}</p>}
          </Glass>
        </motion.div>

        <motion.div variants={rise}>
          <Glass className="h-full p-6">
            <div className="t-eyebrow mb-4">Allocation</div>
            <div className="flex items-center gap-5">
              <Donut items={d.allocation} size={132} center={<div><div className="t-display t-num text-xl font-bold">{d.allocation.length}</div><div className="t-eyebrow" style={{ fontSize: 9 }}>classes</div></div>} />
              <ul className="flex-1 space-y-2 text-xs">
                {d.allocation.map(a => <li key={a.assetClass} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[a.assetClass] }} /><span className="flex-1 text-muted">{CLASS_LABEL[a.assetClass]}</span><b className="t-num">{pctPlain(a.weight)}</b></li>)}
              </ul>
            </div>
          </Glass>
        </motion.div>

        <motion.div variants={rise} className="grid gap-4">
          <Stat icon={Wallet} label="Realised gains" value={d.totals.realised} format={v => money.compact(v)} tone={d.totals.realised >= 0 ? 'good' : 'bad'} sub="From sells so far" />
        </motion.div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {QUICK.map(q => (
          <motion.div key={q.to} variants={rise}>
            <Glass lift className="cursor-pointer p-5" onClick={() => go(q.to)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && go(q.to)}>
              <q.icon size={20} className="text-a3" />
              <div className="t-display mt-3 font-semibold">{q.t}</div>
              <div className="mt-1 text-xs text-muted">{q.d}</div>
            </Glass>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
