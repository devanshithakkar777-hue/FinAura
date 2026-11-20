import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Donut } from '../components/charts.jsx'
import { Card, FormModal, Notice, Row, Tabs, delBtn, num, numOr, useAction } from '../components/kit.jsx'
import { Button, Chip, Empty, ErrorState, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi, useAuth } from '../lib/hooks.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const HK = [['fd', 'Fixed deposit'], ['pf', 'PF / PPF / EPF'], ['sgb', 'Sovereign gold bond'], ['gsec', 'Government security'], ['silver', 'Silver'], ['reit', 'REIT / InvIT'], ['real_estate', 'Real estate'], ['esop', 'ESOP']]
const LK = [['home', 'Home'], ['auto', 'Vehicle'], ['personal', 'Personal'], ['education', 'Education'], ['credit_card', 'Credit card'], ['other', 'Other']]
const PK = [['property', 'Property'], ['pe_vc', 'PE / VC fund'], ['startup', 'Startup stake'], ['art', 'Art'], ['collectible', 'Collectible'], ['p2p', 'P2P lending'], ['commodity', 'Commodity'], ['foreign', 'Foreign asset'], ['other', 'Other']]

function Overview() {
  const { money } = useAuth(), n = useApi('/networth')
  if (n.loading && !n.data) return <Skeletons rows={2} h={160} />
  if (n.error) return <ErrorState message={n.message} onRetry={n.reload} />
  const d = n.data
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Net worth" value={d.netWorth} format={money.compact} tone={d.netWorth >= 0 ? 'good' : 'bad'} />
        <Stat label="Assets" value={d.totalAssets} format={money.compact} />
        <Stat label="Debt" value={d.totalDebt} format={money.compact} tone={d.totalDebt ? 'warn' : undefined} />
        <Stat label="Liquid" value={d.liquidAssets} format={money.compact} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Where your money sits"><div className="flex flex-wrap items-center gap-6"><Donut items={d.allocation.map(a => ({ assetClass: a.group, weight: a.weight }))} /><div className="grid flex-1 gap-1">{d.allocation.map(a => <Row key={a.group} label={a.group} value={`${Math.round(a.weight * 100)}% · ${money.compact(a.value)}`} />)}</div></div></Card>
        <Card title="Debt health">
          <Row label="Debt-to-asset" value={`${(d.debtToAsset * 100).toFixed(0)}%`} />
          <Row label="Monthly EMI" value={money.full(d.monthlyEmi)} />
          <Row label="EMI share of income" value={`${Math.round(d.debtServiceRatio * 100)}%`} sub="Under 40% is a common comfort limit" />
          <Row label="Passive income / yr" value={money.full(d.passiveIncome)} />
        </Card>
      </div>
    </div>
  )
}

function Assets() {
  const { money } = useAuth(), h = useApi('/holdings'), { run } = useAction(), [open, setOpen] = useState(false)
  return (
    <div className="grid gap-4">
      <div className="flex justify-between"><div className="text-sm text-muted">Fixed deposits, PF, bonds, REITs, ESOPs and other non-market assets. Stocks and funds live in Portfolio.</div><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Add</Button></div>
      {h.data?.holdings.length === 0 && <Empty title="No assets yet" body="Add an FD, PF balance or any asset you hold outside the stock market." />}
      {h.data?.holdings.map(x => (
        <Card key={x.id}>
          <div className="flex items-start justify-between gap-3">
            <div><div className="font-semibold">{x.name} <Chip>{x.label}</Chip></div><div className="mt-1 text-xs text-faint">Invested {money.full(x.invested)}{x.rate ? ` · ${x.rate}%` : ''}{x.maturityDate ? ` · matures ${x.maturityDate} (${x.daysToMaturity}d)` : ''}</div></div>
            <div className="flex items-center gap-2"><div className="text-right"><div className="t-num text-lg font-bold">{money.full(x.value)}</div><div className="text-xs" style={{ color: x.gain >= 0 ? 'var(--good)' : 'var(--rose)' }}>{x.gain >= 0 ? '+' : ''}{money.compact(x.gain)}</div></div>{delBtn(() => run(() => api.del(`/holdings/${x.id}`), { ok: 'Removed' }))}</div>
          </div>
        </Card>
      ))}
      <FormModal open={open} onClose={() => setOpen(false)} title="Add an asset" onSubmit={v => run(() => api.post('/holdings', { kind: v.kind, name: v.name, invested: numOr(v.invested), currentValue: num(v.currentValue), rate: num(v.rate), annualIncome: num(v.annualIncome), startDate: v.startDate, maturityDate: v.maturityDate || undefined }), { ok: 'Added' })}
        fields={[{ k: 'kind', label: 'Type', options: HK, req: true, noBlank: true, def: 'fd' }, { k: 'name', label: 'Name', req: true }, { k: 'invested', label: 'Amount invested', type: 'number', req: true }, { k: 'currentValue', label: 'Current value', type: 'number', hint: 'Not needed for a fixed deposit' }, { k: 'rate', label: 'Interest rate %', type: 'number', hint: 'Required for a fixed deposit' }, { k: 'annualIncome', label: 'Annual income it pays', type: 'number' }, { k: 'startDate', label: 'Start date', type: 'date', req: true, def: today() }, { k: 'maturityDate', label: 'Maturity date', type: 'date' }]} />
    </div>
  )
}

function Loans() {
  const { money } = useAuth(), l = useApi('/liabilities'), [extra, setExtra] = useState(0), plan = useApi(`/liabilities/plan?extra=${extra || 0}`), { run } = useAction(), [open, setOpen] = useState(false)
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Add loan</Button></div>
      {l.data?.loans.length === 0 && <Empty title="No loans" body="Debt-free is a good place to be. Add a loan to see payoff and prepayment maths." />}
      {l.data?.loans.map(x => (
        <Card key={x.id}>
          <div className="flex justify-between gap-3"><div><div className="font-semibold">{x.name} {x.highInterest && <Chip tone="bad">high interest</Chip>}</div><div className="mt-1 text-xs text-faint">{x.rate}% · EMI {money.full(x.emi)} · {x.monthsLeft} months left</div></div><div className="flex items-center gap-2"><div className="t-num text-lg font-bold">{money.full(x.outstanding)}</div>{delBtn(() => run(() => api.del(`/liabilities/${x.id}`), { ok: 'Removed' }))}</div></div>
          <div className="mt-3 text-xs text-muted">Interest still to pay {money.compact(x.totalInterestLeft)} · {Math.round(x.interestShareOfEmi * 100)}% of each EMI is interest. {x.prepay10 && `Paying 10% more each month saves ${money.compact(x.prepay10.interestSaved)} and ${x.prepay10.monthsSaved} months.`}</div>
          {x.advice && <div className="mt-2 text-xs text-amber">{x.advice}</div>}
        </Card>
      ))}
      {plan.data?.plan && l.data?.loans.length > 0 && (
        <Card title="Payoff planner" eyebrow="Avalanche — highest rate first">
          <label className="field-label text-xs text-muted">Extra per month<input className="field mt-1" type="number" min="0" value={extra} onChange={e => setExtra(Number(e.target.value))} /></label>
          <div className="mt-3"><Row label="Debt-free in" value={`${plan.data.plan.monthsToDebtFree} months`} /><Row label="Total interest" value={money.full(plan.data.plan.totalInterest)} />{plan.data.plan.interestSaved > 0 && <Row label="Interest saved" value={<span style={{ color: 'var(--good)' }}>{money.full(plan.data.plan.interestSaved)} · {plan.data.plan.monthsSaved} months sooner</span>} />}</div>
        </Card>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="Add a loan" onSubmit={v => run(() => api.post('/liabilities', { kind: v.kind, name: v.name, outstanding: numOr(v.outstanding), rate: numOr(v.rate), emi: numOr(v.emi) }), { ok: 'Added' })}
        fields={[{ k: 'kind', label: 'Type', options: LK, noBlank: true, def: 'home' }, { k: 'name', label: 'Name', req: true }, { k: 'outstanding', label: 'Outstanding amount', type: 'number', req: true }, { k: 'rate', label: 'Interest rate %', type: 'number', req: true }, { k: 'emi', label: 'Monthly EMI', type: 'number', req: true }]} />
    </div>
  )
}

function Private() {
  const { money } = useAuth(), p = useApi('/private'), { run } = useAction(), [open, setOpen] = useState(false)
  return (
    <div className="grid gap-4">
      <Notice>Property, startup stakes, foreign assets and other things with no live price. Values and exchange rates are the ones you enter. Nothing here is auto-valued.</Notice>
      <div className="flex items-center justify-between"><div className="text-sm text-muted">{p.data && `Combined net worth including these: ${money.compact(p.data.combinedNetWorth)}`}</div><Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} />Add</Button></div>
      {p.data?.warnings.map(w => <Notice key={w} tone="warn">{w}</Notice>)}
      {p.data?.views.map(x => (
        <Card key={x.id}>
          <div className="flex justify-between gap-3"><div><div className="font-semibold">{x.name} <Chip>{x.kind}</Chip> {x.illiquid && <Chip tone="warn">illiquid</Chip>}</div><div className="mt-1 text-xs text-faint">{x.currency !== 'INR' && `${x.currency} @ ${x.fxRate} · `}Since {x.startDate} · CAGR {(x.cagr * 100).toFixed(1)}%{x.property && ` · net yield ${(x.property.netYield * 100).toFixed(1)}% · price/rent ${x.property.priceToRent}`}</div></div>
            <div className="flex items-center gap-2"><div className="text-right"><div className="t-num text-lg font-bold">{money.compact(x.valueBase)}</div><div className="text-xs" style={{ color: x.gain >= 0 ? 'var(--good)' : 'var(--rose)' }}>{money.compact(x.gain)}</div></div>{delBtn(() => run(() => api.del(`/private/${x.id}`), { ok: 'Removed' }))}</div></div>
        </Card>
      ))}
      <FormModal open={open} onClose={() => setOpen(false)} title="Add a private or global asset" onSubmit={v => run(() => api.post('/private', { kind: v.kind, name: v.name, currency: v.currency || 'INR', fxRate: numOr(v.fxRate, 1), invested: numOr(v.invested), currentValue: numOr(v.currentValue), startDate: v.startDate, monthlyIncome: numOr(v.monthlyIncome), annualCosts: numOr(v.annualCosts), loanOutstanding: numOr(v.loanOutstanding) }), { ok: 'Added' })}
        fields={[{ k: 'kind', label: 'Type', options: PK, noBlank: true, def: 'property' }, { k: 'name', label: 'Name', req: true }, { k: 'currency', label: 'Currency (3 letters)', def: 'INR', max: 3 }, { k: 'fxRate', label: 'Exchange rate to INR', type: 'number', def: 1 }, { k: 'invested', label: 'Invested', type: 'number', req: true }, { k: 'currentValue', label: 'Current value', type: 'number', req: true }, { k: 'startDate', label: 'Since', type: 'date', req: true, def: today() }, { k: 'monthlyIncome', label: 'Monthly income (rent etc.)', type: 'number' }, { k: 'annualCosts', label: 'Annual costs', type: 'number' }, { k: 'loanOutstanding', label: 'Loan against it', type: 'number' }]} />
    </div>
  )
}

function Dividends() {
  const { money } = useAuth(), d = useApi('/dividends'), e = useApi('/esg'), { run } = useAction(), [open, setOpen] = useState(false)
  const s = d.data?.summary
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-3"><Stat label="Last 12 months" value={s?.ttm ?? 0} format={money.compact} /><Stat label="Forward estimate" value={s?.forwardEstimate ?? 0} format={money.compact} /><Stat label="Yield" value={(s?.yieldOnMarketValue ?? 0) * 100} format={v => `${v.toFixed(2)}%`} /></div>
      <Card title="Dividends received" actions={<Button size="sm" onClick={() => setOpen(true)}><Plus size={14} />Log</Button>}>
        {d.data?.records.length ? d.data.records.map(r => <Row key={r.id} label={`${r.symbol} · ${String(r.received_on).slice(0, 10)}`} value={<span className="flex items-center gap-2">{money.full(r.amount)}{delBtn(() => run(() => api.del(`/dividends/${r.id}`)))}</span>} />) : <p className="text-sm text-muted">No dividends logged yet.</p>}
        {s?.note && <p className="mt-3 text-xs text-faint">{s.note}</p>}
      </Card>
      <Card title="ESG" eyebrow="Scores you enter from a provider you trust">
        {e.data?.view.score == null ? <p className="text-sm text-muted">No ESG ratings entered. {e.data?.view.note}</p> : <><Row label="Portfolio ESG score" value={e.data.view.score} /><Row label="E / S / G" value={`${e.data.view.e ?? '—'} / ${e.data.view.s ?? '—'} / ${e.data.view.g ?? '—'}`} /></>}
      </Card>
      <FormModal open={open} onClose={() => setOpen(false)} title="Log a dividend" onSubmit={v => run(() => api.post('/dividends', { symbol: v.symbol, amount: numOr(v.amount), receivedOn: v.receivedOn }), { ok: 'Logged' })}
        fields={[{ k: 'symbol', label: 'Symbol', req: true }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'receivedOn', label: 'Received on', type: 'date', req: true, def: today() }]} />
    </div>
  )
}

export default function Wealth() {
  const [tab, setTab] = useState('overview')
  return (
    <>
      <PageHeader eyebrow="Wealth IQ" title="Wealth" sub="Everything you own and owe in one place — including the things a broker app never sees." />
      <Tabs tabs={[['overview', 'Overview'], ['assets', 'Assets'], ['loans', 'Loans'], ['private', 'Private & global'], ['income', 'Dividends & ESG']]} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}{tab === 'assets' && <Assets />}{tab === 'loans' && <Loans />}{tab === 'private' && <Private />}{tab === 'income' && <Dividends />}
    </>
  )
}
