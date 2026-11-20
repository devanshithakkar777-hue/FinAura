import { useState } from 'react'
import { Plus, UserPlus } from 'lucide-react'
import { Card, FormModal, Notice, Row, Tabs, delBtn, numOr, useAction, Explain } from '../components/kit.jsx'
import { Button, Chip, Empty, ErrorState, Field, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { Bar } from '../components/charts.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const LEVEL = [['summary', 'Net worth only'], ['full', 'Full summary']]

function Household() {
  const { money } = useAuth(), h = useApi('/household'), { run, busy } = useAction(), [name, setName] = useState(''), [lvl, setLvl] = useState('summary')
  const inHh = !!h.data?.household
  const dash = useApi('/household/dashboard', { enabled: inHh }), exp = useApi('/household/expenses', { enabled: inHh })
  const [open, setOpen] = useState(false)
  if (h.loading && !h.data) return <Skeletons rows={2} h={140} />
  if (h.error) return <ErrorState message={h.message} onRetry={h.reload} />
  const act = (fn, ok) => run(fn, { ok, reload: false }).then(() => { h.reload(); dash.reload?.(); exp.reload?.() })
  if (!inHh) return (
    <div className="grid gap-5">
      {h.data.invitations.map(i => <Card key={i.id} title={`${i.invitedBy} invited you to “${i.name}”`}><p className="mb-3 text-sm text-muted">You choose what they see. Nothing is shared until you accept.</p>
        <div className="flex flex-wrap items-center gap-2"><select className="field !w-auto" value={lvl} onChange={e => setLvl(e.target.value)}>{LEVEL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Button variant="primary" loading={busy} onClick={() => act(() => api.post('/household/accept', { householdId: i.id, shareLevel: lvl }), 'Joined')}>Accept</Button><Button onClick={() => act(() => api.post('/household/decline', { householdId: i.id }))}>Decline</Button></div></Card>)}
      <Card title="Start a household" eyebrow="Family money, shared with consent"><p className="mb-4 text-sm text-muted">Combine net worth and split shared expenses with a partner or family. Each person controls what others can see.</p>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-[220px] flex-1"><Field label="Household name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Our home" /></div><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => act(() => api.post('/household', { name: name.trim(), shareLevel: 'summary' }), 'Household created')}>Create</Button></div></Card>
    </div>
  )
  const hh = h.data.household, d = dash.data, e = exp.data
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-3"><Stat label={hh.name} value={d?.combinedNetWorth ?? 0} format={money.compact} sub="combined net worth" /><Stat label="Members" value={h.data.members.filter(m => m.status === 'active').length} /><Stat label="Shared expenses" value={e?.expenses.length ?? 0} /></div>
      <Card title="Members" actions={hh.isOwner && <Button size="sm" onClick={() => { const v = prompt('Email to invite'); if (v) act(() => api.post('/household/invite', { email: v }), 'Invitation sent') }}><UserPlus size={14} />Invite</Button>}>
        {d?.members.map(m => <Row key={m.name} label={`${m.name}${m.you ? ' (you)' : ''}`} sub={`shares: ${m.shareLevel === 'full' ? 'full summary' : 'net worth only'}`} value={money.compact(m.netWorth)} />)}
        {h.data.members.filter(m => m.status === 'invited').map(m => <Row key={m.email} label={m.email} value={<Chip>invited</Chip>} />)}
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-faint">What I share:</span>{LEVEL.map(([v, l]) => <Button key={v} size="sm" onClick={() => act(() => api.put('/household/share', { shareLevel: v }), 'Updated')}>{l}</Button>)}<Button size="sm" variant="danger" onClick={() => confirm(hh.isOwner ? 'Dissolve the household for everyone?' : 'Leave this household?') && act(() => api.del('/household/leave'), 'Left')}>{hh.isOwner ? 'Dissolve' : 'Leave'}</Button></div>
      </Card>
      <Card title="Shared expenses" actions={<Button size="sm" onClick={() => setOpen(true)}><Plus size={14} />Add</Button>}>
        {e?.settlement.transfers.length > 0 && <Notice>{e.settlement.transfers.map(t => `${t.fromName ?? t.from} pays ${t.toName ?? t.to} ${money.full(t.amount)}`).join(' · ')} <span className="text-faint">({e.settlement.method})</span></Notice>}
        <div className="mt-2">{e?.expenses.map(x => <Row key={x.id} label={x.label} sub={`${String(x.day).slice(0, 10)} · paid by ${x.paidByName}`} value={money.full(x.amount)} />)}{e?.expenses.length === 0 && <p className="text-sm text-muted">No shared expenses yet.</p>}</div>
      </Card>
      <FormModal open={open} onClose={() => setOpen(false)} title="Add a shared expense" onSubmit={v => run(() => api.post('/household/expenses', { label: v.label, amount: numOr(v.amount), day: v.day }), { ok: 'Added', reload: false }).then(() => exp.reload())}
        fields={[{ k: 'label', label: 'What for', req: true }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'day', label: 'Date', type: 'date', req: true, def: today() }]} />
    </div>
  )
}

function Estate() {
  const { money } = useAuth(), e = useApi('/estate'), { run, busy } = useAction(), [open, setOpen] = useState(false), [f, setF] = useState(null)
  if (e.loading && !e.data) return <Skeletons rows={2} h={160} />
  if (e.error) return <ErrorState message={e.message} onRetry={e.reload} />
  const d = e.data, plan = f ?? d.plan
  const save = () => run(() => api.put('/estate/plan', { willExists: !!plan.willExists, willUpdatedOn: plan.willUpdatedOn || null, guardianNamed: !!plan.guardianNamed, powerOfAttorney: !!plan.powerOfAttorney, nomineesUpdatedOn: plan.nomineesUpdatedOn || null, notes: plan.notes || null }), { ok: 'Saved', reload: false }).then(() => { setF(null); e.reload() })
  const total = d.beneficiaries.reduce((s, b) => s + b.sharePct, 0)
  return (
    <div className="grid gap-5">
      <Notice>This is a readiness checklist, not legal advice. Succession law depends on religion, state and asset type — a lawyer should draft a will.</Notice>
      <div className="grid gap-4 sm:grid-cols-2"><Stat label="Readiness" value={d.readiness.score} format={v => `${Math.round(v)}%`} /><Stat label="Estate value" value={d.readiness.estateValue} format={money.compact} /></div>
      <Card title="Checklist">{d.readiness.items.map(i => <Row key={i.key} label={i.label} sub={i.ok ? undefined : i.advice} value={<Chip tone={i.ok ? 'good' : 'warn'}>{i.ok ? 'in place' : 'to do'}</Chip>} />)}</Card>
      <Card title="Your plan" actions={<Button size="sm" variant="primary" loading={busy} onClick={save}>Save</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[['willExists', 'A written will exists'], ['guardianNamed', 'Guardian named for minors'], ['powerOfAttorney', 'Power of attorney in place']].map(([k, l]) => <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--a1)]" checked={!!plan[k]} onChange={x => setF({ ...plan, [k]: x.target.checked })} />{l}</label>)}
          <Field label="Will last updated" type="date" value={plan.willUpdatedOn ? String(plan.willUpdatedOn).slice(0, 10) : ''} onChange={x => setF({ ...plan, willUpdatedOn: x.target.value })} />
          <Field label="Nominees last checked" type="date" value={plan.nomineesUpdatedOn ? String(plan.nomineesUpdatedOn).slice(0, 10) : ''} onChange={x => setF({ ...plan, nomineesUpdatedOn: x.target.value })} />
        </div>
      </Card>
      <Card title="Beneficiaries" eyebrow={`${total}% allocated`} actions={<Button size="sm" onClick={() => setOpen(true)}><Plus size={14} />Add</Button>}>
        {d.beneficiaries.length === 0 && <p className="text-sm text-muted">No beneficiaries recorded.</p>}
        {d.beneficiaries.map(b => <div key={b.id} className="py-2"><div className="flex items-center justify-between text-sm"><span>{b.name} <span className="text-faint">· {b.relation}</span> {b.minor && <Chip tone="warn">minor</Chip>}</span><span className="flex items-center gap-2 t-num">{b.sharePct}% · {money.compact(d.readiness.estateValue * b.sharePct / 100)}{delBtn(() => run(() => api.del(`/estate/beneficiaries/${b.id}`), { reload: false }).then(() => e.reload()))}</span></div><Bar value={b.sharePct / 100} height={4} /></div>)}
        {total > 100 && <p className="mt-2 text-xs text-rose">Shares add up to more than 100%.</p>}
      </Card>
      <Explain e={d.readiness.explain} />
      <FormModal open={open} onClose={() => setOpen(false)} title="Add a beneficiary" onSubmit={v => run(() => api.post('/estate/beneficiaries', { name: v.name, relation: v.relation, sharePct: numOr(v.sharePct), minor: !!v.minor }), { ok: 'Added', reload: false }).then(() => e.reload())}
        fields={[{ k: 'name', label: 'Name', req: true }, { k: 'relation', label: 'Relation', req: true }, { k: 'sharePct', label: 'Share %', type: 'number', req: true }, { k: 'minor', label: 'Is a minor', type: 'checkbox' }]} />
    </div>
  )
}

export default function Family() {
  const [tab, setTab] = useState('household')
  return (
    <>
      <PageHeader eyebrow="Family IQ" title="Family & estate" sub="Money you share with the people you love — and what happens to it if you are not around." />
      <Tabs tabs={[['household', 'Household'], ['estate', 'Estate']]} value={tab} onChange={setTab} />
      {tab === 'household' ? <Household /> : <Estate />}
    </>
  )
}
