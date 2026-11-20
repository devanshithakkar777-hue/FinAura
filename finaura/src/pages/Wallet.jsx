import { useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { Bar } from '../components/charts.jsx'
import { Card, Explain, FormModal, Notice, Row, Tabs, delBtn, numOr, useAction } from '../components/kit.jsx'
import { Button, Chip, Empty, ErrorState, Field, Modal, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const today = () => new Date().toISOString().slice(0, 10)

function Txns() {
  const { money } = useAuth(), t = useApi('/cash/txns'), { run, busy } = useAction(), [open, setOpen] = useState(false), [imp, setImp] = useState(false), [csv, setCsv] = useState('')
  const cats = (t.data?.categories ?? []).map(c => [c, c])
  const doImport = async () => { const r = await run(() => api.post('/cash/import', { csv }), { ok: x => `Imported ${x.imported}${x.skipped ? `, skipped ${x.skipped}` : ''}` }); if (r) { setImp(false); setCsv('') } }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setImp(true)}><Upload size={16} />Import bank CSV</Button><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Add</Button></div>
      {t.loading && !t.data ? <Skeletons rows={3} h={60} /> : t.data?.transactions.length === 0 ? <Empty title="No transactions yet" body="Import a bank statement CSV (Date, Description, Debit, Credit) or add one by hand. Nothing leaves your account." /> : (
        <Card>{t.data.transactions.map(x => (
          <div key={x.id} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0" style={{ borderColor: 'var(--stroke)' }}>
            <div className="w-24 shrink-0 text-xs text-faint">{x.day}</div>
            <div className="min-w-0 flex-1 truncate">{x.merchant || x.description || '—'}</div>
            <select className="field !w-auto !py-1 text-xs" value={x.category} onChange={e => run(() => api.patch(`/cash/txns/${x.id}`, { category: e.target.value }), { reload: false, ok: 'Category updated' })}>{cats.map(([c]) => <option key={c}>{c}</option>)}</select>
            <div className="t-num w-28 text-right font-semibold" style={{ color: x.direction === 'in' ? 'var(--good)' : undefined }}>{x.direction === 'in' ? '+' : '−'}{money.full(x.amount)}</div>
            {delBtn(() => run(() => api.del(`/cash/txns/${x.id}`)))}
          </div>))}</Card>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="Add a transaction" onSubmit={v => run(() => api.post('/cash/txns', { day: v.day, amount: numOr(v.amount), direction: v.direction, merchant: v.merchant || undefined, description: v.description || undefined, category: v.category || undefined }), { ok: 'Added' })}
        fields={[{ k: 'direction', label: 'Type', options: [['out', 'Money out'], ['in', 'Money in']], noBlank: true, def: 'out' }, { k: 'day', label: 'Date', type: 'date', req: true, def: today() }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'merchant', label: 'Merchant' }, { k: 'description', label: 'Note' }, { k: 'category', label: 'Category', options: cats, hint: 'Leave blank to auto-categorise' }]} />
      <Modal open={imp} onClose={() => setImp(false)} title="Import bank statement" wide>
        <p className="mb-3 text-sm text-muted">Paste CSV text or choose a file. Needs a date column, a description, and debit/credit or an amount column.</p>
        <input type="file" accept=".csv,text/csv" className="mb-3 text-sm" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
        <Field label="CSV"><textarea className="field" rows={8} value={csv} onChange={e => setCsv(e.target.value)} placeholder="Date,Description,Debit,Credit" /></Field>
        <Button className="mt-3" variant="primary" loading={busy} disabled={!csv.trim()} onClick={doImport}>Import</Button>
      </Modal>
    </div>
  )
}

function Analysis() {
  const { money } = useAuth(), a = useApi('/cash/analysis')
  if (a.loading && !a.data) return <Skeletons rows={2} h={160} />
  if (a.error) return <ErrorState message={a.message} onRetry={a.reload} />
  const d = a.data.analysis, subs = a.data.subscriptions
  if (!d.ready) return <Notice tone="warn">{d.note}</Notice>
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Avg income" value={d.avgIncome} format={money.compact} /><Stat label="Avg spend" value={d.avgSpend} format={money.compact} /><Stat label="Saved" value={d.avgSavings} format={money.compact} tone="good" /><Stat label="Savings rate" value={d.savingsRate * 100} format={v => `${Math.round(v)}%`} /></div>
      <Card title="Where it goes" eyebrow={`${d.monthsUsed}-month average · ${Math.round(d.fixedShare * 100)}% fixed`}><div className="grid gap-3">{d.categories.map(c => <div key={c.category}><div className="mb-1 flex justify-between text-sm"><span>{c.category} {c.fixed && <Chip>fixed</Chip>}</span><span className="t-num text-muted">{money.compact(c.amount)} · {Math.round(c.share * 100)}%</span></div><Bar value={c.share} height={6} /></div>)}</div></Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Explain e={d.explain} />
        <Card title="Recurring payments" eyebrow={`${money.compact(subs.monthlyTotal)}/month · ${money.compact(subs.annualTotal)}/year`}>
          {subs.subscriptions.map(s => <Row key={s.name} label={s.name} sub={`${s.cadence} · next ${s.nextDue}`} value={<span className="flex items-center gap-2">{money.full(s.amount)}{s.priceIncrease && <Chip tone="warn">price up</Chip>}</span>} />)}
        </Card>
      </div>
    </div>
  )
}

function Budgets() {
  const { money } = useAuth(), b = useApi('/cash/budgets'), a = useApi('/cash/analysis'), t = useApi('/cash/txns'), { run } = useAction(), [open, setOpen] = useState(false)
  const month = new Date().toISOString().slice(0, 7), spent = {}
  ;(t.data?.transactions ?? []).filter(x => x.direction === 'out' && x.day.startsWith(month)).forEach(x => { spent[x.category] = (spent[x.category] ?? 0) + x.amount })
  void a
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Set budget</Button></div>
      {b.data?.budgets.length === 0 && <Empty title="No budgets" body="Set a monthly limit for a category to see how this month is tracking." />}
      {b.data?.budgets.map(x => { const s = spent[x.category] ?? 0, r = x.monthlyLimit ? s / x.monthlyLimit : 0; return (
        <Card key={x.category}><div className="flex items-center justify-between text-sm"><b>{x.category}</b><span className="flex items-center gap-2 t-num">{money.full(s)} / {money.full(x.monthlyLimit)}{delBtn(() => run(() => api.del(`/cash/budgets/${encodeURIComponent(x.category)}`)))}</span></div><div className="mt-2"><Bar value={Math.min(1, r)} height={7} color={r > 1 ? 'var(--rose)' : r > 0.8 ? 'var(--amber)' : 'var(--good)'} /></div></Card>) })}
      <FormModal open={open} onClose={() => setOpen(false)} title="Set a monthly budget" onSubmit={v => run(() => api.put('/cash/budgets', { category: v.category, monthlyLimit: numOr(v.monthlyLimit) }), { ok: 'Saved' })}
        fields={[{ k: 'category', label: 'Category', options: (t.data?.categories ?? []).map(c => [c, c]), req: true }, { k: 'monthlyLimit', label: 'Monthly limit', type: 'number', req: true }]} />
    </div>
  )
}

function Watch() {
  const an = useApi('/anomalies'), fr = useApi('/fraud')
  return (
    <div className="grid gap-5">
      <Card title="Unusual activity" eyebrow={an.data ? `${an.data.checked.cashTransactions} transactions checked` : ''}>
        {an.data?.anomalies.length ? an.data.anomalies.map((x, i) => <div key={i} className="mb-3"><div className="mb-2 flex items-center gap-2"><Chip tone={x.severity === 'high' ? 'bad' : 'warn'}>{x.severity}</Chip><span className="text-sm font-medium">{x.type}</span></div><Explain e={x.explain} /></div>) : <p className="text-sm text-muted">Nothing unusual found.</p>}
      </Card>
      <Card title="Fraud check" eyebrow="Heuristics on your own transactions">
        {fr.data?.flags.length ? fr.data.flags.map((f, i) => <Notice key={i} tone="warn">{f.message ?? f.title ?? JSON.stringify(f)}</Notice>) : <p className="text-sm text-muted">No suspicious patterns in {fr.data?.checked ?? 0} transactions.</p>}
        <ul className="mt-4 grid gap-1 text-[13px] text-muted">{fr.data?.tips.map(t => <li key={t}>• {t}</li>)}</ul>
        <p className="mt-3 text-xs text-faint">{fr.data?.note}</p>
      </Card>
    </div>
  )
}

export default function Wallet() {
  const [tab, setTab] = useState('txns')
  return (
    <>
      <PageHeader eyebrow="Wallet IQ" title="Wallet" sub="Everyday money: transactions, where it goes, subscriptions, budgets and anything that looks off." />
      <Tabs tabs={[['txns', 'Transactions'], ['analysis', 'Analysis'], ['budgets', 'Budgets'], ['watch', 'Alerts & fraud']]} value={tab} onChange={setTab} />
      {tab === 'txns' && <Txns />}{tab === 'analysis' && <Analysis />}{tab === 'budgets' && <Budgets />}{tab === 'watch' && <Watch />}
    </>
  )
}
