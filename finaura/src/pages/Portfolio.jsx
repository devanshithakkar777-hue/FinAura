import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Database, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button, Chip, Empty, ErrorState, Field, Glass, Modal, PageHeader, Segmented, Skeletons } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { CLASS_LABEL, pct, shortDate, todayISO } from '../lib/format.js'
import { useApi, useAuth, useToasts } from '../lib/hooks.jsx'

const CLASSES = Object.keys(CLASS_LABEL)

function AddTrade({ open, onClose, onDone }) {
  const { money } = useAuth(); const { push } = useToasts()
  const blank = { symbol: '', side: 'buy', quantity: '', price: '', date: todayISO(), note: '', name: '', assetClass: 'equity' }
  const [f, setF] = useState(blank), [needAsset, setNeed] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const assets = useApi(q.length > 0 ? `/assets?q=${encodeURIComponent(q)}` : null, { enabled: open && q.length > 0 })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    const body = { symbol: f.symbol.trim().toUpperCase(), side: f.side, quantity: Number(f.quantity), price: Number(f.price), date: f.date, note: f.note || undefined }
    if (needAsset) { body.name = f.name; body.assetClass = f.assetClass }
    try {
      const r = await api.post('/transactions', body)
      push({ kind: 'success', text: `Trade logged · +${r.xpAwarded} XP` })
      r.unlocked?.forEach(u => push({ kind: 'success', title: `Unlocked: ${u.title}`, text: u.desc }))
      setF(blank); setNeed(false); onDone(); onClose()
    } catch (x) {
      if (x.code === 'unknown_asset') { setNeed(true); setErr('New symbol — tell us its name and type to add it.') } else setErr(errorMessage(x))
    } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Log a trade">
      <form onSubmit={submit} className="grid gap-4">
        <Segmented value={f.side} onChange={v => setF({ ...f, side: v })} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
        <Field label="Symbol" required value={f.symbol} list="asset-list" placeholder="e.g. DEMO_INDEX or your own" onChange={e => { set('symbol')(e); setQ(e.target.value.slice(0, 20)); setNeed(false) }} />
        <datalist id="asset-list">{(assets.data?.assets ?? []).map(a => <option key={a.symbol} value={a.symbol}>{a.name}</option>)}</datalist>
        {needAsset && <div className="grid gap-4 sm:grid-cols-2"><Field label="Name" required value={f.name} onChange={set('name')} /><Field label="Type"><select className="field" value={f.assetClass} onChange={set('assetClass')}>{CLASSES.map(c => <option key={c} value={c}>{CLASS_LABEL[c]}</option>)}</select></Field></div>}
        <div className="grid grid-cols-2 gap-4"><Field label="Quantity" type="number" step="any" min="0" required value={f.quantity} onChange={set('quantity')} /><Field label={`Price (${money.symbol})`} type="number" step="any" min="0" required value={f.price} onChange={set('price')} /></div>
        <Field label="Date" type="date" required max={todayISO()} value={f.date} onChange={set('date')} />
        <Field label="Note (optional)" maxLength={200} value={f.note} onChange={set('note')} />
        {err && <div role="alert" className="text-sm text-rose">{err}</div>}
        <Button variant="primary" size="lg" loading={busy} type="submit">Save trade</Button>
      </form>
    </Modal>
  )
}

function ImportCsv({ open, onClose, onDone }) {
  const { push } = useToasts(); const [csv, setCsv] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(null)
  const file = useRef(null)
  const submit = async () => {
    setBusy(true); setErr(null)
    try { const r = await api.post('/transactions/import', { csv }); push({ kind: 'success', title: 'Import complete', text: `${r.imported} trades imported.` }); setCsv(''); onDone(); onClose() }
    catch (x) { setErr(x) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import from CSV" wide>
      <p className="mb-3 text-sm text-muted">Header: <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">date,symbol,side,quantity,price[,name,class,note]</code>. Dates as YYYY-MM-DD. Nothing is saved if any row is invalid.</p>
      <input ref={file} type="file" accept=".csv,text/csv,text/plain" hidden onChange={async e => { const t = e.target.files?.[0]; if (t) setCsv(await t.text()); e.target.value = '' }} />
      <div className="mb-3 flex gap-2"><Button size="sm" onClick={() => file.current?.click()}><FileUp size={14} />Choose file</Button></div>
      <textarea className="field t-num font-mono text-xs" placeholder={'date,symbol,side,quantity,price\n2025-01-10,MYSTOCK,buy,10,250'} value={csv} onChange={e => setCsv(e.target.value)} />
      {err && <div role="alert" className="mt-3 text-sm text-rose">{err.message}{err.details?.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{err.details.slice(0, 6).map(d => <li key={d.row}>Row {d.row}: {d.message}</li>)}</ul>}</div>}
      <Button className="mt-4" variant="primary" loading={busy} disabled={!csv.trim()} onClick={submit}>Import</Button>
    </Modal>
  )
}

export default function Portfolio() {
  const { money, invalidate, refresh } = useAuth(); const { push } = useToasts()
  const p = useApi('/portfolio'), tx = useApi('/transactions')
  const [add, setAdd] = useState(false), [imp, setImp] = useState(false), [busy, setBusy] = useState('')
  const [tab, setTab] = useState('holdings')
  const done = () => { invalidate(); refresh() }
  const demo = async () => { setBusy('demo'); try { const r = await api.post('/demo'); done(); push({ kind: 'success', text: `${r.loaded} synthetic demo trades loaded.` }) } catch (e) { push({ kind: 'error', text: errorMessage(e) }) } finally { setBusy('') } }
  const prices = async () => { setBusy('px'); try { await api.post('/prices/refresh'); done(); push({ kind: 'success', text: 'Prices refreshed.' }) } catch (e) { push({ kind: e.status === 501 ? 'info' : 'error', text: e.status === 501 ? 'No live price provider is configured on this server.' : errorMessage(e) }) } finally { setBusy('') } }
  const del = async id => { if (!confirm('Delete this transaction?')) return; try { await api.del(`/transactions/${id}`); done() } catch (e) { push({ kind: 'error', text: errorMessage(e) }) } }

  if (p.loading && !p.data) return <><PageHeader title="Portfolio" /><Skeletons rows={3} h={90} /></>
  if (p.error) return <ErrorState message={p.message} onRetry={p.reload} />
  const d = p.data

  return (
    <>
      <PageHeader eyebrow="Holdings" title="Portfolio" actions={<>
        <Button size="sm" loading={busy === 'px'} onClick={prices}><RefreshCw size={14} />Refresh prices</Button>
        <Button size="sm" onClick={() => setImp(true)}><FileUp size={14} />Import CSV</Button>
        <Button size="sm" variant="primary" onClick={() => setAdd(true)}><Plus size={14} />Log trade</Button></>} />
      {d.empty ? (
        <Empty title="No trades yet" body="Log your first trade, import a CSV from your broker, or explore with a clearly-labelled synthetic demo portfolio."
          action={<Button variant="primary" loading={busy === 'demo'} onClick={demo}><Database size={16} />Load demo data</Button>} />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3"><Segmented value={tab} onChange={setTab} options={[{ value: 'holdings', label: 'Holdings' }, { value: 'history', label: `Transactions${tx.data ? ` (${tx.data.total})` : ''}` }]} />{d.dataQuality === 'synthetic' && <Chip tone="warn">Synthetic prices</Chip>}</div>
          {tab === 'holdings' ? (
            <div className="grid gap-3">
              {d.positions.map((x, i) => (
                <motion.div key={x.symbol} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .04 }}>
                  <Glass lift className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="min-w-[180px] flex-1"><div className="font-semibold">{x.name}</div><div className="mt-0.5 text-xs text-faint">{x.symbol} · {CLASS_LABEL[x.assetClass]} · RSI {d.rsi[x.symbol] ?? '–'}</div></div>
                      <div className="text-right"><div className="t-eyebrow">Value</div><div className="t-num font-semibold">{money.full(x.value)}</div></div>
                      <div className="hidden text-right sm:block"><div className="t-eyebrow">Avg cost</div><div className="t-num text-muted">{money.precise(x.avgCost)}</div></div>
                      <div className="text-right"><div className="t-eyebrow">P&L</div><div className="t-num font-semibold" style={{ color: x.unrealised >= 0 ? 'var(--good)' : 'var(--rose)' }}>{pct(x.unrealisedPct)}</div></div>
                      <div className="w-14 text-right"><div className="t-eyebrow">Weight</div><div className="t-num text-muted">{(x.weight * 100).toFixed(0)}%</div></div>
                    </div>
                  </Glass>
                </motion.div>
              ))}
            </div>
          ) : tx.loading && !tx.data ? <Skeletons rows={4} h={56} /> : tx.error ? <ErrorState message={tx.message} onRetry={tx.reload} /> : (
            <Glass flat className="overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
                <thead><tr className="t-eyebrow text-left"><th className="p-4">Date</th><th>Asset</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="w-12" /></tr></thead>
                <tbody>{tx.data.transactions.map(t => (
                  <tr key={t.id} className="border-t" style={{ borderColor: 'var(--stroke)' }}>
                    <td className="p-4 text-muted">{shortDate(t.date)}</td><td><div className="font-medium">{t.symbol}</div>{t.source === 'demo' && <span className="text-[10px] text-faint">demo</span>}</td>
                    <td><Chip tone={t.side === 'buy' ? 'good' : 'bad'}>{t.side}</Chip></td>
                    <td className="t-num text-right">{Number(t.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td className="t-num text-right">{money.precise(t.price)}</td>
                    <td className="pr-3 text-right"><button aria-label="Delete transaction" onClick={() => del(t.id)} className="rounded-lg p-2 text-faint hover:text-rose"><Trash2 size={15} /></button></td>
                  </tr>))}</tbody>
              </table></div>
            </Glass>
          )}
        </>
      )}
      <AddTrade open={add} onClose={() => setAdd(false)} onDone={done} />
      <ImportCsv open={imp} onClose={() => setImp(false)} onDone={done} />
    </>
  )
}
