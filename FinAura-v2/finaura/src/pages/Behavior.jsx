import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Flame, Zap } from 'lucide-react'
import { EmptyPortfolio } from '../components/EmptyPortfolio.jsx'
import { Bar, Ring } from '../components/charts.jsx'
import { Chip, Empty, ErrorState, Glass, PageHeader, Skeletons, rise, stagger } from '../components/ui.jsx'
import { shortDate } from '../lib/format.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const TRAITS = [['patience', 'Patience'], ['discipline', 'Discipline'], ['consistency', 'Consistency'], ['riskMgmt', 'Risk management'], ['diversification', 'Diversification']]
const SEV = { concern: ['bad', AlertTriangle], watch: ['warn', Info], strength: ['good', CheckCircle2] }
const TAG = { panic_sell: ['bad', 'Panic sell'], fomo_buy: ['warn', 'FOMO buy'] }

export default function Behavior() {
  const { money } = useAuth()
  const p = useApi('/portfolio'), b = useApi('/behavior')
  if ((p.loading && !p.data) || (b.loading && !b.data)) return <><PageHeader title="Behavior" /><Skeletons rows={3} h={160} /></>
  if (p.error || b.error) return <ErrorState message={p.message || b.message} onRetry={() => { p.reload(); b.reload() }} />
  if (p.data.empty) return <><PageHeader eyebrow="Behavioral Alpha" title="Behavior" /><EmptyPortfolio what="behavioral analysis" /></>
  const d = b.data
  if (d.status !== 'ok') return <><PageHeader eyebrow="Behavioral Alpha" title="Behavior" /><Empty icon={Info} title="Not enough history yet" body={d.message} /></>
  const a = d.alpha, neg = a.amount < 0
  const events = d.events.filter(e => e.tag)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <PageHeader eyebrow="Behavioral Alpha" title="What your decisions are worth" sub="We replay your history against a version of you who made the same purchases and never sold." />
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={rise} className="lg:col-span-2">
          <Glass className="h-full p-7" style={{ boxShadow: `0 0 80px -30px ${neg ? 'var(--rose)' : 'var(--good)'}, inset 0 1px 0 rgba(255,255,255,.1)` }}>
            <div className="t-eyebrow flex items-center gap-2"><Zap size={13} />Behavioral Alpha</div>
            <div className="t-display t-num mt-3 text-[48px] font-extrabold leading-none sm:text-[64px]" style={{ color: neg ? 'var(--rose)' : 'var(--good)' }}>{neg ? '−' : '+'}{money.full(Math.abs(a.amount))}</div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{a.explanation}</p>
            <div className="mt-5 flex flex-wrap gap-2"><Chip>{a.sellCount} sells analysed</Chip><Chip tone={d.evidence.panicSells ? 'bad' : 'good'}>{d.evidence.panicSells} panic sells</Chip><Chip tone={d.evidence.fomoBuys ? 'warn' : 'good'}>{d.evidence.fomoBuys} FOMO buys</Chip></div>
            {d.dataQuality === 'synthetic' && <p className="mt-4 text-xs text-faint">Based on synthetic demo prices.</p>}
          </Glass>
        </motion.div>
        <motion.div variants={rise}>
          <Glass className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="t-eyebrow mb-4">Behavior score</div>
            <Ring value={d.score} size={160} label="of 100" colors={['var(--a2)', 'var(--a3)']} />
            <div className="mt-4 text-xs text-faint">{d.stats.trades} trades · {d.stats.tradesPerMonth}/month</div>
          </Glass>
        </motion.div>

        <motion.div variants={rise}>
          <Glass className="h-full p-6">
            <div className="t-eyebrow mb-4">Your traits</div>
            <div className="grid gap-4">{TRAITS.map(([k, label]) => (
              <div key={k}><div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{label}</span><b className="t-num">{d.traits[k]}</b></div><Bar value={d.traits[k] / 100} color={d.traits[k] >= 70 ? 'var(--good)' : d.traits[k] >= 40 ? 'var(--amber)' : 'var(--rose)'} /></div>
            ))}</div>
          </Glass>
        </motion.div>

        <motion.div variants={rise} className="lg:col-span-2">
          <Glass className="h-full p-6">
            <div className="t-eyebrow mb-4">Patterns we found</div>
            {d.patterns.length === 0 ? <p className="text-sm text-muted">No strong patterns yet — keep going.</p> : (
              <ul className="grid gap-3">{d.patterns.map(p => {
                const [tone, I] = SEV[p.severity] ?? SEV.watch
                return (
                  <li key={p.key} className="flex gap-3.5 rounded-2xl p-4" style={{ background: 'var(--glass-b)', border: '1px solid var(--stroke)' }}>
                    <I size={18} className="mt-0.5 shrink-0" style={{ color: `var(--${tone === 'good' ? 'good' : tone === 'bad' ? 'rose' : 'amber'})` }} />
                    <div><div className="text-sm font-semibold">{p.label}</div><div className="mt-1 text-sm leading-relaxed text-muted">{p.detail}</div></div>
                  </li>
                )
              })}</ul>
            )}
          </Glass>
        </motion.div>

        {events.length > 0 && (
          <motion.div variants={rise} className="lg:col-span-3">
            <Glass className="p-6">
              <div className="t-eyebrow mb-4 flex items-center gap-2"><Flame size={13} />Flagged decisions</div>
              <ul className="divide-y" style={{ borderColor: 'var(--stroke)' }}>{events.map(e => (
                <li key={e.id} className="flex items-center gap-3 py-3 text-sm" style={{ borderColor: 'var(--stroke)' }}>
                  <Chip tone={TAG[e.tag]?.[0]}>{TAG[e.tag]?.[1] ?? e.tag}</Chip>
                  <span className="flex-1"><b>{e.side === 'sell' ? 'Sold' : 'Bought'}</b> {e.symbol}</span>
                  <span className="text-xs text-faint">{shortDate(e.day)}</span>
                </li>
              ))}</ul>
            </Glass>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
