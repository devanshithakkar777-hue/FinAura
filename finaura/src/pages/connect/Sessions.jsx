import { useState } from 'react'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { Card, FormModal, Notice, Row, Tabs, useAction } from '../../components/kit.jsx'
import { Button, Chip, Empty, Field, Glass, PageHeader, Skeletons } from '../../components/ui.jsx'
import { api } from '../../lib/api.js'
import { go, useApi, useAuth, useRoute } from '../../lib/hooks.jsx'
import { KIND_LABEL, SHARE_SCOPES, STATUS_TONE, when } from './common.jsx'

function Detail({ id }) {
  const { money } = useAuth(), d = useApi(`/connect/consultations/${id}`), msgs = useApi(`/connect/consultations/${id}/messages`)
  const share = useApi(`/connect/consultations/${id}/share/log`), { run, busy } = useAction()
  const [scope, setScope] = useState({ netWorth: true, wellness: true }), [days, setDays] = useState(14), [body, setBody] = useState(''), [docOpen, setDocOpen] = useState(false), [rev, setRev] = useState({ rating: 5, text: '' }), [complain, setComplain] = useState(false)
  const reload = () => { d.reload(); msgs.reload(); share.reload() }
  if (d.loading && !d.data) return <Skeletons rows={3} h={100} />
  const c = d.data?.consultation
  if (!c) return <Empty title="Session not found" />
  const open = ['requested', 'confirmed'].includes(c.status), active = d.data.shares?.filter(s => s.status === 'active') ?? []
  return (
    <div className="grid gap-5">
      <button onClick={() => go('/connect/sessions')} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} />All sessions</button>
      <Glass flat className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="t-eyebrow">{KIND_LABEL[c.kind]} with {d.data.expert.name}</div><h2 className="t-display mt-1 text-2xl font-bold">{c.topic}</h2></div><Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip></div>
        <p className="mt-3 text-sm text-muted">{c.question}</p>
        <div className="mt-3 text-xs text-faint">{c.scheduledFor ? `${when(c.scheduledFor)} · ` : ''}Fee {c.fee ? money.full(c.fee) : 'free'} · payment {c.paymentStatus.replace('_', ' ')}{c.meetingLink && <> · <a className="underline" href={c.meetingLink} target="_blank" rel="noreferrer">meeting link</a></>}</div>
        {open && <Button className="mt-4" size="sm" variant="danger" onClick={() => confirm('Cancel this session? Any data you shared is revoked.') && run(() => api.post(`/connect/consultations/${id}/cancel`), { ok: 'Cancelled', reload: false }).then(reload)}>Cancel session</Button>}
      </Glass>

      {open && <Card title="What do you want to share with the expert?" eyebrow="Your choice · revocable any time">
        <p className="mb-3 text-sm text-muted">Nothing is shared by default. Tick only what is useful. The expert sees exactly these items until the date below, and every view is logged for you.</p>
        <div className="grid gap-2">{SHARE_SCOPES.map(([k, l]) => <label key={k} className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--a1)]" checked={!!scope[k]} onChange={e => setScope({ ...scope, [k]: e.target.checked })} />{l}</label>)}</div>
        <div className="mt-4 flex flex-wrap items-end gap-3"><div className="w-40"><Field label="Expires in (days)" type="number" min="1" max="90" value={days} onChange={e => setDays(Number(e.target.value))} /></div>
          <Button variant="primary" loading={busy} disabled={!Object.values(scope).some(Boolean)} onClick={() => run(() => api.post(`/connect/consultations/${id}/share`, { scope, expiresInDays: days }), { ok: 'Shared as chosen', reload: false }).then(reload)}><ShieldCheck size={16} />{active.length ? 'Update sharing' : 'Share selected'}</Button>
          {active.length > 0 && <Button variant="danger" onClick={() => run(() => api.post(`/connect/consultations/${id}/share/revoke`), { ok: 'Sharing stopped', reload: false }).then(reload)}>Stop sharing</Button>}
          <Button onClick={() => setDocOpen(true)}>Add a document</Button></div>
        {active.length > 0 && <p className="mt-3 text-xs text-good">Currently sharing: {Object.entries(active[0].scope).filter(([, v]) => v).map(([k]) => k).join(', ')} until {when(active[0].expiresAt)}</p>}
      </Card>}
      {share.data?.log.length > 0 && <Card title="Who looked, and when">{share.data.log.slice(0, 10).map((l, i) => <Row key={i} label={`${l.expert}: ${l.what}`} value={when(l.at)} />)}</Card>}

      <Card title="Messages" eyebrow="Only you and your expert(s)" actions={msgs.data?.messages.length > 0 && <Button size="sm" onClick={() => run(() => api.post(`/connect/consultations/${id}/ai-summary`), { reload: false, ok: r => (r.summary ? 'Summary added' : r.note) }).then(reload)}>AI summary</Button>}>
        <div className="grid max-h-80 gap-3 overflow-y-auto">{msgs.data?.messages.map(m => <div key={m.id} className={m.authorKind === 'user' ? 'text-right' : ''}><div className="text-[11px] text-faint">{m.label ?? m.author} · {when(m.created_at)}</div><div className="mt-0.5 inline-block max-w-[85%] rounded-2xl px-3.5 py-2 text-left text-sm" style={{ background: m.authorKind === 'user' ? 'color-mix(in srgb, var(--a1) 18%, transparent)' : 'var(--glass-a)', border: m.authorKind === 'ai' ? '1px dashed var(--gold)' : '1px solid var(--stroke)' }}>{m.body}</div></div>)}{msgs.data?.messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}</div>
        {!['cancelled', 'declined'].includes(c.status) && <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); if (body.trim()) run(() => api.post(`/connect/consultations/${id}/messages`, { body: body.trim() }), { reload: false }).then(() => { setBody(''); msgs.reload() }) }}><input className="field flex-1" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} placeholder="Write a message…" /><Button variant="primary" type="submit">Send</Button></form>}
      </Card>

      {d.data.room.length > 0 && <Card title="Experts in this room">{d.data.room.map(r => <Row key={r.id} label={r.name} value={<Chip tone={r.status === 'joined' ? 'good' : undefined}>{r.status}</Chip>} />)}</Card>}

      {c.status === 'completed' && <Card title="How did it go?"><div className="flex flex-wrap items-end gap-3"><select className="field !w-auto" value={rev.rating} onChange={e => setRev({ ...rev, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select><div className="min-w-[200px] flex-1"><Field label="Comment (optional)" value={rev.text} onChange={e => setRev({ ...rev, text: e.target.value })} maxLength={800} /></div><Button variant="primary" onClick={() => run(() => api.post(`/connect/consultations/${id}/review`, { rating: rev.rating, text: rev.text || undefined }), { ok: 'Thanks for the review', reload: false })}>Submit review</Button></div></Card>}
      {!['requested', 'declined'].includes(c.status) && <button className="text-left text-xs text-faint underline" onClick={() => setComplain(true)}>Something went wrong? Report a concern</button>}

      <FormModal open={docOpen} onClose={() => setDocOpen(false)} title="Add a document" onSubmit={v => run(() => api.post(`/connect/consultations/${id}/documents`, { title: v.title, kind: v.kind, text: v.text }), { ok: 'Added. The expert sees it only if you tick Documents above.', reload: false })}
        fields={[{ k: 'title', label: 'Title', req: true }, { k: 'kind', label: 'Type', options: ['insurance', 'loan', 'tax', 'statement', 'advice', 'other'].map(x => [x, x]), noBlank: true, def: 'other' }, { k: 'text', label: 'Paste the text', textarea: true, req: true, hint: 'Remove account numbers, PAN and Aadhaar first.' }]} wide />
      <FormModal open={complain} onClose={() => setComplain(false)} title="Report a concern" submitLabel="Send to FinAura reviewers" onSubmit={v => run(() => api.post('/connect/complaints', { expertId: c.expertId, consultationId: id, body: v.body }), { ok: 'Received. A reviewer will look at it.', reload: false })}
        fields={[{ k: 'body', label: 'What happened?', textarea: true, req: true, max: 1500, hint: 'For regulated advice you can also complain to the regulator or the expert’s professional body.' }]} />
    </div>
  )
}

function List() {
  const { money } = useAuth(), l = useApi('/connect/consultations'), a = useApi('/connect/actions'), { run } = useAction()
  const [tab, setTab] = useState('sessions')
  return (
    <>
      <Tabs tabs={[['sessions', 'Sessions'], ['actions', `Action items${a.data?.actions.filter(x => x.status === 'open').length ? ` (${a.data.actions.filter(x => x.status === 'open').length})` : ''}`]]} value={tab} onChange={setTab} />
      {tab === 'sessions' ? (l.loading && !l.data ? <Skeletons rows={3} h={80} /> : l.data?.consultations.length === 0 ? <Empty title="No sessions yet" body="Find an expert to book your first session." action={<Button variant="primary" onClick={() => go('/connect')}>Find an expert</Button>} /> : (
        <div className="grid gap-3">{l.data.consultations.map(c => <button key={c.id} className="text-left" onClick={() => go(`/connect/sessions?id=${c.id}`)}><Glass lift flat className="flex items-center justify-between gap-3 p-5"><div><div className="font-semibold">{c.topic}</div><div className="text-xs text-faint">{c.expertName} · {KIND_LABEL[c.kind]}{c.scheduledFor ? ` · ${when(c.scheduledFor)}` : ''} · {c.fee ? money.full(c.fee) : 'free'}</div></div><Chip tone={STATUS_TONE[c.status]}>{c.status}</Chip></Glass></button>)}</div>))
        : <Card title="Your follow-ups">{a.data?.actions.length ? a.data.actions.map(x => <label key={x.id} className="flex items-start gap-3 border-b py-3 text-sm last:border-0" style={{ borderColor: 'var(--stroke)' }}><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--a1)]" checked={x.status === 'done'} onChange={e => run(() => api.patch(`/connect/actions/${x.id}`, { status: e.target.checked ? 'done' : 'open' }), { reload: false }).then(() => a.reload())} /><span className={x.status === 'done' ? 'text-faint line-through' : ''}>{x.text}<span className="block text-xs text-faint">from {x.expert}{x.dueOn ? ` · due ${String(x.dueOn).slice(0, 10)}` : ''}</span></span></label>) : <p className="text-sm text-muted">Action items your expert sets after a session appear here.</p>}</Card>}
      <div className="mt-5"><Notice>Fees are shown for information and settled directly with the expert in this version. Payments through FinAura are not processed yet.</Notice></div>
    </>
  )
}

export default function Sessions() {
  const { params } = useRoute()
  return (
    <>
      <PageHeader eyebrow="FinAura Connect" title="My sessions" sub="Your bookings, what you've shared, and the follow-ups from your experts." />
      {params.id ? <Detail key={params.id} id={params.id} /> : <List />}
    </>
  )
}
