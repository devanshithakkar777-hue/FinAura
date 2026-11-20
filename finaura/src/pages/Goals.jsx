import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Target, Trash2 } from 'lucide-react'
import { Bar } from '../components/charts.jsx'
import { Button, Chip, Disclaimer, Empty, ErrorState, Field, Glass, Modal, PageHeader, Skeletons } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { shortDate } from '../lib/format.js'
import { useApi, useAuth, useToasts } from '../lib/hooks.jsx'

const STATUS = { on_track: ['good', 'On track', 'var(--good)'], close: ['warn', 'Close', 'var(--amber)'], behind: ['bad', 'Behind', 'var(--rose)'] }

export default function Goals() {
  const { money, invalidate, refresh } = useAuth(); const { push } = useToasts()
  const g = useApi('/goals')
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [f, setF] = useState({ name: '', targetAmount: '', targetDate: '', monthlyContribution: '' })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const create = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = await api.post('/goals', { name: f.name, targetAmount: Number(f.targetAmount), targetDate: f.targetDate, monthlyContribution: Number(f.monthlyContribution || 0) })
      invalidate(); refresh(); setOpen(false); setF({ name: '', targetAmount: '', targetDate: '', monthlyContribution: '' })
      push({ kind: 'success', text: `Goal created · +${r.xpAwarded} XP` }); r.unlocked?.forEach(u => push({ kind: 'success', title: `Unlocked: ${u.title}`, text: u.desc }))
    } catch (x) { setErr(errorMessage(x)) } finally { setBusy(false) }
  }
  const del = async id => { if (!confirm('Delete this goal?')) return; try { await api.del(`/goals/${id}`); invalidate() } catch (x) { push({ kind: 'error', text: errorMessage(x) }) } }
  const [minDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })

  return (
    <>
      <PageHeader eyebrow="Plan" title="Goals" sub="Track what you're saving for, and whether your current path gets you there." actions={<Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={14} />New goal</Button>} />
      {g.loading && !g.data ? <Skeletons rows={2} /> : g.error ? <ErrorState message={g.message} onRetry={g.reload} /> : g.data.goals.length === 0 ? (
        <Empty icon={Target} title="No goals yet" body="Set a target — a house, a sabbatical, financial freedom — and we'll project whether you're on track." action={<Button variant="primary" onClick={() => setOpen(true)}>Create your first goal</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {g.data.goals.map((x, i) => {
            const [tone, label, color] = STATUS[x.status] ?? STATUS.behind
            return (
              <motion.div key={x.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
                <Glass lift className="p-6">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="t-display text-lg font-semibold">{x.name}</h3><div className="mt-1 text-xs text-faint">by {shortDate(x.targetDate)} · {money.full(x.monthlyContribution)}/mo</div></div><div className="flex items-center gap-1"><Chip tone={tone}>{label}</Chip><button aria-label="Delete goal" onClick={() => del(x.id)} className="rounded-lg p-1.5 text-faint hover:text-rose"><Trash2 size={15} /></button></div></div>
                  <div className="mt-5 flex items-baseline justify-between"><div className="t-display t-num text-2xl font-bold" style={{ color }}>{money.compact(x.projected)}</div><div className="text-sm text-muted">of {money.compact(x.targetAmount)}</div></div>
                  <div className="mt-2"><Bar value={Math.min(1, x.onTrackRatio)} color={color} height={8} /></div>
                  <div className="mt-2 text-xs text-faint">Projected at {Math.round(x.assumedReturn * 100)}%/yr · {Math.round(x.onTrackRatio * 100)}% of target</div>
                </Glass>
              </motion.div>
            )
          })}
        </div>
      )}
      {g.data?.note && <Disclaimer>{g.data.note}</Disclaimer>}
      <Modal open={open} onClose={() => setOpen(false)} title="New goal">
        <form onSubmit={create} className="grid gap-4">
          <Field label="Name" required maxLength={80} value={f.name} onChange={set('name')} placeholder="e.g. House down payment" />
          <Field label={`Target amount (${money.symbol})`} type="number" min="1" step="any" required value={f.targetAmount} onChange={set('targetAmount')} />
          <Field label="Target date" type="date" required min={minDate} value={f.targetDate} onChange={set('targetDate')} />
          <Field label={`Monthly contribution (${money.symbol})`} type="number" min="0" step="any" value={f.monthlyContribution} onChange={set('monthlyContribution')} />
          {err && <div role="alert" className="text-sm text-rose">{err}</div>}
          <Button variant="primary" size="lg" loading={busy} type="submit">Create goal</Button>
        </form>
      </Modal>
    </>
  )
}
