import { useState } from 'react'
import { Card, Explain, Notice, Row, Tabs, useAction } from '../components/kit.jsx'
import { Button, Chip, ErrorState, Field, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const FIELDS = [['otherIncome', 'Other income'], ['basic', 'Basic salary (annual)'], ['hraReceived', 'HRA received'], ['rentPaid', 'Rent paid (annual)'], ['c80', '80C investments'], ['d80Self', '80D — self & family'], ['d80Parents', '80D — parents'], ['nps1b', 'NPS 80CCD(1B)'], ['employerNps', 'Employer NPS'], ['homeLoanInterest', 'Home-loan interest'], ['tdsPaid', 'TDS already paid']]

function Regimes() {
  const { money } = useAuth(), r = useApi('/tax/regimes'), inp = useApi('/tax/inputs'), { run, busy } = useAction(), [f, setF] = useState(null)
  if (r.loading && !r.data) return <Skeletons rows={2} h={180} />
  if (r.error) return <ErrorState message={r.message} onRetry={r.reload} />
  const c = r.data.comparison, form = f ?? inp.data?.inputs ?? {}
  const save = () => run(() => api.put('/tax/inputs', Object.fromEntries(FIELDS.map(([k]) => [k, Number(form[k] ?? 0)]).concat([['metro', !!form.metro]]))), { ok: 'Saved' })
  return (
    <div className="grid gap-5">
      {!c.ready ? <Notice tone="warn">Add your annual income in Settings → Profile to compare regimes.</Notice> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3"><Stat label="New regime tax" value={c.new.totalTax} format={money.compact} tone={c.better === 'new' ? 'good' : undefined} sub={`effective ${(c.new.effectiveRate * 100).toFixed(1)}%`} /><Stat label="Old regime tax" value={c.old.totalTax} format={money.compact} tone={c.better === 'old' ? 'good' : undefined} sub={`effective ${(c.old.effectiveRate * 100).toFixed(1)}%`} /><Stat label={`${c.better === 'new' ? 'New' : 'Old'} regime saves`} value={c.saving} format={money.compact} tone="good" /></div>
          <Explain e={c.explain} />
          {c.refundOrDue != null && c.tdsPaid > 0 && <Notice>With {money.full(c.tdsPaid)} TDS paid, you {c.refundOrDue <= 0 ? 'would get a refund of' : 'would owe about'} {money.full(Math.abs(c.refundOrDue))}.</Notice>}
        </>
      )}
      <Card title="Your numbers" eyebrow={`FY ${r.data.taxYear}`} actions={<Button variant="primary" size="sm" loading={busy} onClick={save}>Save & recompute</Button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELDS.map(([k, l]) => <Field key={k} label={l} type="number" min="0" value={form[k] ?? ''} onChange={e => setF({ ...form, [k]: e.target.value })} />)}</div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.metro} onChange={e => setF({ ...form, metro: e.target.checked })} />Live in a metro city (HRA 50%)</label>
      </Card>
      {r.data.savings?.opportunities && <Card title="Deduction headroom" eyebrow="Old regime only">{r.data.savings.opportunities.map(o => <Row key={o.section} label={o.section} sub={o.note} value={<span className="flex items-center gap-2">{money.compact(o.headroom)} left<Chip tone="good">save ≈ {money.compact(o.potentialSaving)}</Chip></span>} />)}<p className="mt-2 text-xs text-faint">{r.data.savings.regimeNote}</p></Card>}
    </div>
  )
}

function Gains() {
  const { money } = useAuth(), g = useApi('/tax/capital-gains'), h = useApi('/tax/harvest')
  if (g.loading && !g.data) return <Skeletons rows={2} h={160} />
  if (g.error) return <ErrorState message={g.message} onRetry={g.reload} />
  const d = g.data, hv = h.data
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Estimated tax" value={d.tax} format={money.compact} /><Stat label="Short-term equity" value={d.net.eqShort} format={money.compact} /><Stat label="Long-term equity" value={d.net.eqLong} format={money.compact} sub={`₹1.25L exempt · ${money.compact(d.exemptionHeadroom)} unused`} /><Stat label="Crypto (VDA) gains" value={d.vdaTaxableGain} format={money.compact} sub="30% flat, no set-off" /></div>
      <Explain e={d.explain} />
      {hv && <Card title="Tax-loss harvesting" eyebrow="Simulation only"><Row label="Tax now" value={money.full(hv.taxNow)} /><Row label="If losses were booked" value={money.full(hv.taxAfterHarvest)} /><Row label="Could save" value={money.full(hv.estimatedSaving)} /><Row label="Long-term gains you could book tax-free" value={money.full(hv.gainHarvest.bookableTaxFree)} sub={`avoids ≈ ${money.compact(hv.gainHarvest.futureTaxAvoided)} later`} /><Explain className="mt-3" e={hv.explain} /></Card>}
      <p className="text-xs text-faint">{d.assumptions.join(' ')}</p>
    </div>
  )
}

function Docs() {
  const d = useApi('/tax/documents'), { run } = useAction()
  return (
    <Card title="Filing checklist" eyebrow="Documents to gather">
      {d.data?.documents.map(x => <label key={x.key} className="flex items-center gap-3 border-b py-3 text-sm last:border-0" style={{ borderColor: 'var(--stroke)' }}><input type="checkbox" className="h-4 w-4 accent-[var(--a1)]" checked={x.done} onChange={e => run(() => api.put('/tax/documents', { key: x.key, done: e.target.checked }), { reload: false })} /><span className={x.done ? 'text-faint line-through' : ''}>{x.label}</span></label>)}
    </Card>
  )
}

export default function Tax() {
  const [tab, setTab] = useState('regimes')
  return (
    <>
      <PageHeader eyebrow="Tax IQ · India FY2026-27" title="Tax" sub="Regime comparison, capital gains and harvesting estimates. Estimates only — confirm with a chartered accountant before filing." />
      <Tabs tabs={[['regimes', 'Old vs new regime'], ['gains', 'Capital gains'], ['docs', 'Checklist']]} value={tab} onChange={setTab} />
      {tab === 'regimes' && <Regimes />}{tab === 'gains' && <Gains />}{tab === 'docs' && <Docs />}
    </>
  )
}
