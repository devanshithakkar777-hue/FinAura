import { useState } from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import { Card, Notice, Row, Tabs, delBtn, useAction } from '../components/kit.jsx'
import { Button, Chip, Empty, ErrorState, Field, Modal, PageHeader, Skeletons, Stat } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi } from '../lib/hooks.jsx'

const SCOPES = [['netWorth', 'Net worth'], ['wellness', 'Wellness score'], ['behaviour', 'Behaviour summary'], ['plan', 'Retirement readiness'], ['allocation', 'Asset allocation']]
const on = s => SCOPES.filter(([k]) => s?.[k]).map(([, l]) => l)

function ScopePicker({ requested, value, onChange }) {
  return <div className="grid gap-2">{SCOPES.filter(([k]) => !requested || requested[k]).map(([k, l]) => <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--a1)]" checked={!!value[k]} onChange={e => onChange({ ...value, [k]: e.target.checked })} />{l}</label>)}</div>
}

function MyAdvisors() {
  const a = useApi('/me/advisors'), { run, busy } = useAction(), [sel, setSel] = useState({}), [logFor, setLogFor] = useState(null)
  const log = useApi(`/me/advisors/${logFor}/access-log`, { enabled: !!logFor })
  const after = () => a.reload()
  if (a.loading && !a.data) return <Skeletons rows={2} h={120} />
  if (a.error) return <ErrorState message={a.message} onRetry={a.reload} />
  const list = a.data.advisors.filter(x => x.status !== 'revoked')
  if (!list.length) return <Empty title="No advisor has asked for access" body="If an adviser or planner invites you, you will see their request here. They see nothing until you accept, and you choose exactly what to share." />
  return (
    <div className="grid gap-4">{list.map(x => { const v = sel[x.id] ?? (x.status === 'invited' ? x.requestedScope : x.scope) ?? {}; return (
      <Card key={x.id} title={x.brandName} actions={<Chip tone={x.status === 'active' ? 'good' : 'warn'}>{x.status === 'active' ? 'sharing' : 'invited'}</Chip>}>
        {x.registrationNote && <p className="mb-2 text-xs text-faint">{x.registrationNote}</p>}
        <div className="t-eyebrow mb-2">{x.status === 'invited' ? 'They ask to see' : 'You share'}</div>
        <ScopePicker requested={x.requestedScope} value={v} onChange={n => setSel(s => ({ ...s, [x.id]: n }))} />
        <div className="mt-4 flex flex-wrap gap-2">
          {x.status === 'invited' ? <><Button variant="primary" loading={busy} onClick={() => run(() => api.post(`/me/advisors/${x.id}/accept`, { scope: v }), { ok: 'Access granted', reload: false }).then(after)}>Accept with these choices</Button><Button onClick={() => run(() => api.post(`/me/advisors/${x.id}/decline`), { reload: false }).then(after)}>Decline</Button></>
            : <><Button loading={busy} onClick={() => run(() => api.put(`/me/advisors/${x.id}/scope`, { scope: v }), { ok: 'Updated', reload: false }).then(after)}>Update sharing</Button><Button onClick={() => setLogFor(x.id)}>Who looked, and when</Button><Button variant="danger" onClick={() => confirm('Stop sharing with this adviser now?') && run(() => api.post(`/me/advisors/${x.id}/revoke`), { ok: 'Access revoked', reload: false }).then(after)}>Revoke</Button></>}
        </div>
      </Card>) })}
      <Modal open={!!logFor} onClose={() => setLogFor(null)} title="Access log">{log.data?.log.length ? log.data.log.map((l, i) => <Row key={i} label={l.what} value={String(l.at).replace('T', ' ').slice(0, 16)} />) : <p className="text-sm text-muted">Nothing has been viewed yet.</p>}</Modal>
    </div>
  )
}

function Workspace() {
  const w = useApi('/org'), { run, busy } = useAction(), [f, setF] = useState({ name: '', brandName: '', primaryColor: '#6366f1', disclaimer: '', registrationNote: '' })
  const org = w.data?.org, has = !!org
  const cl = useApi('/org/clients', { enabled: has }), dash = useApi('/org/dashboard', { enabled: has }), keys = useApi('/org/api-keys', { enabled: has })
  const [inv, setInv] = useState(false), [email, setEmail] = useState(''), [sc, setSc] = useState({ netWorth: true, wellness: true }), [newKey, setNewKey] = useState(null), [kn, setKn] = useState('')
  if (w.loading && !w.data) return <Skeletons rows={2} h={140} />
  if (w.error) return <ErrorState message={w.message} onRetry={w.reload} />
  const form = has && f.name === '' ? { name: org.name, brandName: org.brandName ?? '', primaryColor: org.primaryColor ?? '#6366f1', disclaimer: org.disclaimer ?? '', registrationNote: org.registrationNote ?? '' } : f
  const body = () => ({ name: form.name, brandName: form.brandName || null, primaryColor: form.primaryColor || null, disclaimer: form.disclaimer || null, registrationNote: form.registrationNote || null })
  const save = () => run(() => (has ? api.put('/org', body()) : api.post('/org', body())), { ok: has ? 'Saved' : 'Workspace created', reload: false }).then(() => w.reload())
  return (
    <div className="grid gap-5">
      <Notice tone="warn">FinAura is an analysis tool. If you give regulated advice to clients you must hold the registration your jurisdiction requires and stay responsible for that advice.</Notice>
      <Card title={has ? 'Workspace & white-label' : 'Create an advisor workspace'} actions={<Button variant="primary" size="sm" loading={busy} disabled={!form.name.trim()} onClick={save}>{has ? 'Save' : 'Create'}</Button>}>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Firm name" value={form.name} onChange={e => setF({ ...form, name: e.target.value })} /><Field label="Brand shown to clients" value={form.brandName} onChange={e => setF({ ...form, brandName: e.target.value })} /><Field label="Brand colour" type="color" value={form.primaryColor} onChange={e => setF({ ...form, primaryColor: e.target.value })} /><Field label="Registration note (e.g. SEBI RIA no.)" value={form.registrationNote} onChange={e => setF({ ...form, registrationNote: e.target.value })} /></div>
        <Field label="Client-facing disclaimer"><textarea className="field mt-1" rows={3} maxLength={600} value={form.disclaimer} onChange={e => setF({ ...form, disclaimer: e.target.value })} /></Field>
      </Card>
      {has && <>
        <div className="grid gap-4 sm:grid-cols-3"><Stat label="Active clients" value={dash.data?.aggregate.activeClients ?? 0} /><Stat label="Avg wellness" value={dash.data?.aggregate.averageWellness ?? 0} format={v => (dash.data?.aggregate.averageWellness == null ? '—' : Math.round(v))} /><Stat label="Needing attention" value={dash.data?.aggregate.needingAttention.length ?? 0} tone={dash.data?.aggregate.needingAttention.length ? 'warn' : undefined} /></div>
        <Card title="Clients" actions={<Button size="sm" onClick={() => setInv(true)}><UserPlus size={14} />Invite</Button>}>
          {cl.data?.clients.length === 0 && <p className="text-sm text-muted">No clients yet. Invite by email — they accept and choose what you can see.</p>}
          {cl.data?.clients.map(c => { const card = dash.data?.clients.find(x => x.linkId === c.id); return (
            <div key={c.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}>
              <div className="flex items-center justify-between gap-3"><div><b className="text-sm">{c.name ?? c.email}</b><div className="text-xs text-faint">{c.status === 'active' ? `sharing: ${on(c.scope).join(', ') || 'nothing'}` : `${c.status} · asked for: ${on(c.requestedScope).join(', ')}`}</div></div><div className="flex items-center gap-2"><Chip tone={c.status === 'active' ? 'good' : undefined}>{c.status}</Chip>{c.status !== 'revoked' && delBtn(() => run(() => api.del(`/org/clients/${c.id}`), { ok: 'Removed', reload: false }).then(() => { cl.reload(); dash.reload() }), 'Remove client')}</div></div>
              {card && <div className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-3">{card.netWorth != null && <span>Net worth <b className="text-ink">{card.netWorth.toLocaleString('en-IN')}</b></span>}{card.wellness && <span>Wellness <b className="text-ink">{card.wellness.score}</b> ({card.wellness.band})</span>}{card.plan && <span>Retirement <b className="text-ink">{Math.round(card.plan.retirementReadiness * 100)}%</b></span>}{card.behaviour && <span>Flags: {card.behaviour.flags.join(', ') || 'none'}</span>}</div>}
            </div>) })}
        </Card>
        <Card title="API & integrations" eyebrow="Server-to-server" actions={<div className="flex gap-2"><input className="field !w-40 !py-1.5" placeholder="Key name" value={kn} onChange={e => setKn(e.target.value)} /><Button size="sm" disabled={!kn.trim()} onClick={() => run(() => api.post('/org/api-keys', { name: kn.trim() }), { reload: false }).then(r => { if (r) { setNewKey(r.key); setKn(''); keys.reload() } })}><KeyRound size={14} />New key</Button></div>}>
          {newKey && <Notice tone="good"><b>Copy your key now — it is shown once:</b><code className="mt-1 block break-all text-xs">{newKey}</code></Notice>}
          {keys.data?.keys.map(k => <Row key={k.id} label={k.name} sub={`${k.prefix}… · ${k.revoked_at ? 'revoked' : k.last_used_at ? `last used ${String(k.last_used_at).slice(0, 10)}` : 'never used'}`} value={!k.revoked_at && delBtn(() => run(() => api.del(`/org/api-keys/${k.id}`), { ok: 'Revoked', reload: false }).then(() => keys.reload()), 'Revoke key')} />)}
          <p className="mt-3 text-xs text-faint">Send the key in an <code>x-api-key</code> header to <code>/v1/stress</code>, <code>/v1/wellness</code>, <code>/v1/projection</code> or <code>/v1/tax/regimes</code>. These endpoints compute from the numbers you send; no user data is stored.</p>
        </Card>
        <Modal open={inv} onClose={() => setInv(false)} title="Invite a client">
          <Field label="Client email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <div className="t-eyebrow mb-2 mt-4">Ask to see</div><ScopePicker value={sc} onChange={setSc} />
          <Button className="mt-4" variant="primary" loading={busy} disabled={!email || !Object.values(sc).some(Boolean)} onClick={() => run(() => api.post('/org/clients/invite', { email, scope: sc }), { ok: 'Invitation sent', reload: false }).then(r => { if (r) { setInv(false); setEmail(''); cl.reload() } })}>Send invitation</Button>
        </Modal>
      </>}
    </div>
  )
}

export default function Advisor() {
  const [tab, setTab] = useState('mine')
  return (
    <>
      <PageHeader eyebrow="FinAura Enterprise" title="Advisors & API" sub="Let a professional see only what you choose — or run your own advisory practice on FinAura." />
      <Tabs tabs={[['mine', 'My advisors'], ['workspace', 'Advisor workspace']]} value={tab} onChange={setTab} />
      {tab === 'mine' ? <MyAdvisors /> : <Workspace />}
    </>
  )
}
