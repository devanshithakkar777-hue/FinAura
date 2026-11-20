import { useState } from 'react'
import { Card, FormModal, Notice, Row, Tabs, useAction } from '../../components/kit.jsx'
import { Button, Chip, Empty, ErrorState, PageHeader, Skeletons, Stat } from '../../components/ui.jsx'
import { api } from '../../lib/api.js'
import { useApi, useAuth } from '../../lib/hooks.jsx'
import { DAYS, KIND_LABEL, STATUS_TONE, TierChip, availText, when } from './common.jsx'

const split = s => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean)
const dayFields = DAYS.map((d, i) => ({ k: `d${i}`, label: d, type: 'checkbox' }))

function ProfileForm({ open, onClose, meta, initial, onDone }) {
  const { run } = useAction()
  const e = initial
  const init = e ? { ...e, displayName: e.name, specialties: e.specialties.join(', '), languages: e.languages.join(', '), registrationBody: e.registration?.split(' · ')[0] ?? '', registrationNumber: e.registration?.split(' · ')[1] ?? '', ...Object.fromEntries((e.availability ?? []).map(s => [`d${s.day}`, true])), availStart: e.availability?.[0]?.start ?? '10:00', availEnd: e.availability?.[0]?.end ?? '18:00' } : { availStart: '10:00', availEnd: '18:00', feeModel: 'per_session', yearsExperience: 0 }
  const submit = v => {
    const availability = DAYS.map((_, i) => i).filter(i => v[`d${i}`]).map(day => ({ day, start: v.availStart || '10:00', end: v.availEnd || '18:00' }))
    const body = { displayName: v.displayName, headline: v.headline, bio: v.bio, category: v.category, capacity: v.capacity, specialties: split(v.specialties), languages: split(v.languages), credentials: v.credentials, registrationBody: v.registrationBody || null, registrationNumber: v.registrationNumber || null, yearsExperience: Number(v.yearsExperience || 0), fee: Number(v.fee || 0), feeModel: v.feeModel, feeDisclosure: v.feeDisclosure, conflictsDisclosure: v.conflictsDisclosure, availability, acceptsNri: !!v.acceptsNri }
    return run(() => (e ? api.put('/connect/expert/me', body) : api.post('/connect/expert/apply', body)), { ok: r => r.note ?? 'Saved', reload: false }).then(onDone)
  }
  return (
    <FormModal open={open} onClose={onClose} wide title={e ? 'Edit your profile' : 'Apply as an expert'} submitLabel={e ? 'Save' : 'Submit for review'} initial={init} onSubmit={submit}
      fields={[
        { k: 'displayName', label: 'Name shown', req: true }, { k: 'headline', label: 'Headline', req: true, max: 140 }, { k: 'bio', label: 'About you (min 20 characters)', textarea: true, req: true, max: 1500 },
        { k: 'category', label: 'Main category', options: Object.entries(meta?.categories ?? {}), req: true },
        { k: 'capacity', label: 'Professional capacity', options: (meta?.capacities ?? []).map(c => [c.key, `${c.label}${c.regulated ? ' (regulated)' : ''}`]), req: true, hint: 'Only a registered investment adviser can give personalised investment advice.' },
        { k: 'registrationBody', label: 'Registration body (e.g. SEBI, ICAI, IRDAI)' }, { k: 'registrationNumber', label: 'Registration number', hint: 'Required for regulated capacities. FinAura reviews it before you are listed.' },
        { k: 'credentials', label: 'Credentials & qualifications', req: true, textarea: true, max: 600 }, { k: 'specialties', label: 'Specialties (comma separated)' }, { k: 'languages', label: 'Languages (comma separated)', req: true },
        { k: 'yearsExperience', label: 'Years of experience', type: 'number' }, { k: 'fee', label: 'Fee per session', type: 'number', req: true }, { k: 'feeModel', label: 'Fee model', options: [['per_session', 'Per session'], ['hourly', 'Hourly'], ['free_first', 'First session free']], noBlank: true },
        { k: 'feeDisclosure', label: 'Fee disclosure (shown to clients)', textarea: true, req: true, max: 500 }, { k: 'conflictsDisclosure', label: 'Conflicts of interest (shown to clients)', textarea: true, req: true, max: 500, hint: 'Commissions, referral fees, ties to products you may discuss.' },
        ...dayFields, { k: 'availStart', label: 'From (IST)', type: 'time' }, { k: 'availEnd', label: 'To (IST)', type: 'time' }, { k: 'acceptsNri', label: 'I advise NRI clients', type: 'checkbox' },
      ]} />
  )
}

function Workspace() {
  const { money } = useAuth(), w = useApi('/connect/expert/workspace'), inv = useApi('/connect/expert/room-invites'), { run } = useAction()
  const [acad, setAcad] = useState(false), [note, setNote] = useState(null), [act, setAct] = useState(null), [brief, setBrief] = useState(null)
  const reload = () => { w.reload(); inv.reload() }
  if (w.loading && !w.data) return <Skeletons rows={2} h={120} />
  if (w.error) return <ErrorState message={w.message} onRetry={w.reload} />
  const d = w.data, respond = (id, decision) => run(() => api.post(`/connect/expert/consultations/${id}/respond`, { decision }), { ok: decision === 'confirm' ? 'Confirmed' : 'Declined', reload: false }).then(reload)
  const loadBrief = async id => { const r = await run(() => api.get(`/connect/expert/consultations/${id}/brief`), { reload: false }); if (r) setBrief({ id, ...r }) }
  return (
    <div className="grid gap-5">
      {d.status !== 'verified' && <Notice tone="warn">Your profile is {d.status}. You will not appear to clients until FinAura verifies your credentials.</Notice>}
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Pending requests" value={d.pending.length} tone={d.pending.length ? 'warn' : undefined} /><Stat label="Upcoming" value={d.upcoming.length} /><Stat label="Open follow-ups" value={d.openFollowUps} /><Stat label="Fees recorded" value={d.feesRecorded} format={money.compact} /></div>
      {inv.data?.invites.map(i => <Card key={i.id} title="Invited to a multi-expert room"><p className="text-sm text-muted">{i.topic}: {i.question}</p><div className="mt-3 flex gap-2"><Button variant="primary" size="sm" onClick={() => run(() => api.post(`/connect/expert/room-invites/${i.id}/respond`, { accept: true }), { ok: 'Joined', reload: false }).then(reload)}>Join</Button><Button size="sm" onClick={() => run(() => api.post(`/connect/expert/room-invites/${i.id}/respond`, { accept: false }), { reload: false }).then(reload)}>Decline</Button></div></Card>)}
      <Card title="Requests">{d.pending.length === 0 && <p className="text-sm text-muted">No new requests.</p>}{d.pending.map(c => <div key={c.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="text-sm"><b>{c.clientName}</b> · {KIND_LABEL[c.kind]} · {c.topic}</div><p className="mt-1 text-xs text-muted">{c.question}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="primary" onClick={() => respond(c.id, 'confirm')}>Confirm</Button><Button size="sm" onClick={() => respond(c.id, 'decline')}>Decline</Button><Button size="sm" onClick={() => loadBrief(c.id)}>Pre-call brief</Button></div></div>)}</Card>
      <Card title="Upcoming & active">{d.upcoming.length === 0 && <p className="text-sm text-muted">Nothing confirmed.</p>}{d.upcoming.map(c => <div key={c.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="text-sm"><b>{c.clientName}</b> · {c.topic} {c.scheduledFor && <span className="text-faint">· {when(c.scheduledFor)}</span>}</div><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => loadBrief(c.id)}>Brief</Button><Button size="sm" onClick={() => setNote(c.id)}>Private note</Button><Button size="sm" onClick={() => setAct(c.id)}>Add action item</Button><Button size="sm" variant="primary" onClick={() => run(() => api.post(`/connect/expert/consultations/${c.id}/complete`), { ok: 'Marked completed', reload: false }).then(reload)}>Complete</Button></div></div>)}</Card>
      <Card title="Your clients">{d.clients.length === 0 ? <p className="text-sm text-muted">Clients appear here after you take a booking.</p> : d.clients.map(c => <Row key={c.name} label={c.name} sub={`last ${when(c.last)}`} value={`${c.consultations} session${c.consultations > 1 ? 's' : ''}`} />)}</Card>
      <Card title="Publish to the Academy" actions={<Button size="sm" onClick={() => setAcad(true)}>New webinar / course</Button>}><p className="text-sm text-muted">General education builds trust. Keep it non-personal.</p></Card>
      <Notice>{d.note}</Notice>
      {brief && <Card title="Pre-consultation brief" actions={<Button size="sm" onClick={() => setBrief(null)}>Close</Button>}><Notice>{brief.note}</Notice><p className="mt-3 text-sm">{brief.brief.aiSummary ?? brief.brief.summary ?? ''}</p>{brief.brief.missing?.length > 0 && <p className="mt-2 text-xs text-amber">Missing: {brief.brief.missing.join(', ')}</p>}<pre className="mt-3 max-h-64 overflow-auto rounded-xl p-3 text-xs" style={{ background: 'var(--glass-a)' }}>{JSON.stringify(brief.shared, null, 2)}</pre></Card>}
      <FormModal open={acad} onClose={() => setAcad(false)} title="New Academy item" onSubmit={v => run(() => api.post('/connect/expert/academy', { title: v.title, kind: v.kind, description: v.description, startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null, fee: Number(v.fee || 0) }), { ok: 'Published', reload: false })} fields={[{ k: 'title', label: 'Title', req: true }, { k: 'kind', label: 'Type', options: [['webinar', 'Webinar'], ['course', 'Course'], ['article', 'Article']], noBlank: true, def: 'webinar' }, { k: 'description', label: 'Description', textarea: true, req: true }, { k: 'startsAt', label: 'Starts', type: 'datetime-local' }, { k: 'fee', label: 'Fee', type: 'number', def: 0 }]} />
      <FormModal open={!!note} onClose={() => setNote(null)} title="Private note" hint="" onSubmit={v => run(() => api.post('/connect/expert/notes', { consultationId: note, note: v.note }), { ok: 'Saved. Clients cannot see this.', reload: false })} fields={[{ k: 'note', label: 'Note (private to you)', textarea: true, req: true, max: 2000 }]} />
      <FormModal open={!!act} onClose={() => setAct(null)} title="Action item for your client" onSubmit={v => run(() => api.post(`/connect/expert/consultations/${act}/actions`, { text: v.text, dueOn: v.dueOn || null }), { ok: 'Added', reload: false })} fields={[{ k: 'text', label: 'What should they do?', req: true, max: 300 }, { k: 'dueOn', label: 'Due', type: 'date' }]} />
    </div>
  )
}

function Admin() {
  const [st, setSt] = useState('pending'), q = useApi(`/connect/admin/experts?status=${st}`), c = useApi('/connect/admin/complaints'), au = useApi('/connect/admin/audit'), { run } = useAction()
  const [rej, setRej] = useState(null), [res, setRes] = useState(null)
  const decide = (id, decision, reason) => run(() => api.post(`/connect/admin/experts/${id}/decision`, { decision, reason }), { ok: 'Done', reload: false }).then(() => { q.reload(); au.reload() })
  return (
    <div className="grid gap-5">
      <Notice>Verification here is a document-review workflow. Check the registration on the regulator’s official register before approving. Nothing is verified automatically.</Notice>
      <Card title="Expert applications" actions={<select className="field !w-auto !py-1" value={st} onChange={e => setSt(e.target.value)}>{['pending', 'verified', 'rejected', 'suspended'].map(s => <option key={s}>{s}</option>)}</select>}>
        {q.data?.experts.length === 0 && <p className="text-sm text-muted">None.</p>}
        {q.data?.experts.map(e => <div key={e.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">{e.name}</b> <span className="text-xs text-faint">{e.email}</span><div className="text-xs text-muted">{e.capacityInfo.label} · {e.registration ?? 'no registration given'} · {e.credentials}</div></div>
          <div className="flex gap-2">{e.status === 'pending' && <><Button size="sm" variant="primary" onClick={() => decide(e.id, 'verify')}>Verify</Button><Button size="sm" onClick={() => setRej({ id: e.id, decision: 'reject' })}>Reject</Button></>}{e.status === 'verified' && <Button size="sm" variant="danger" onClick={() => setRej({ id: e.id, decision: 'suspend' })}>Suspend</Button>}{['suspended', 'rejected'].includes(e.status) && <Button size="sm" onClick={() => decide(e.id, 'reinstate')}>Reinstate</Button>}</div></div></div>)}
      </Card>
      <Card title="Open complaints">{c.data?.complaints.length === 0 && <p className="text-sm text-muted">None open.</p>}{c.data?.complaints.map(x => <div key={x.id} className="border-b py-3 last:border-0" style={{ borderColor: 'var(--stroke)' }}><div className="text-sm"><b>{x.expert}</b></div><p className="text-xs text-muted">{x.body}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => setRes({ id: x.id, outcome: 'upheld' })}>Uphold</Button><Button size="sm" onClick={() => setRes({ id: x.id, outcome: 'dismissed' })}>Dismiss</Button></div></div>)}</Card>
      <Card title="Audit log">{au.data?.log.slice(0, 15).map(l => <Row key={l.id} label={`${l.role}: ${l.action}`} sub={l.target ?? ''} value={when(l.at)} />)}</Card>
      <FormModal open={!!rej} onClose={() => setRej(null)} title={rej?.decision === 'reject' ? 'Reject application' : 'Suspend expert'} onSubmit={v => decide(rej.id, rej.decision, v.reason)} fields={[{ k: 'reason', label: 'Reason (shown to the expert)', textarea: true, req: true, max: 500 }]} />
      <FormModal open={!!res} onClose={() => setRes(null)} title={`Resolve: ${res?.outcome}`} onSubmit={v => run(() => api.post(`/connect/admin/complaints/${res.id}/resolve`, { outcome: res.outcome, resolution: v.resolution }), { ok: 'Resolved', reload: false }).then(() => { c.reload(); au.reload() })} fields={[{ k: 'resolution', label: 'Resolution notes', textarea: true, req: true, max: 500 }]} />
    </div>
  )
}

export default function Expert() {
  const meta = useApi('/connect/meta'), me = useApi('/connect/expert/me'), admin = useApi('/connect/admin/experts?status=pending'), [tab, setTab] = useState('work'), [edit, setEdit] = useState(false)
  if (me.loading && !me.data) return <Skeletons rows={2} h={120} />
  const ex = me.data?.expert, isAdmin = !admin.error && !!admin.data
  return (
    <>
      <PageHeader eyebrow="FinAura Connect" title="For experts" sub="Run your practice: take bookings, prepare from consented client data, follow up, and publish to the Academy." actions={ex && <Button onClick={() => setEdit(true)}>Edit profile</Button>} />
      {!ex ? (
        <div className="grid gap-5"><Empty title="Become a verified expert" body="Tell us who you are and how you are registered. FinAura reviews your credentials before you are listed, and clients see your fees and conflicts upfront." action={<Button variant="primary" onClick={() => setEdit(true)}>Apply</Button>} />{isAdmin && <Admin />}</div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2"><Chip tone={STATUS_TONE[ex.status]}>{ex.status}</Chip><TierChip trust={ex.trust} /><span className="text-xs text-faint">{ex.capacityInfo.label} · {availText(ex.availability)} (IST)</span>{ex.statusReason && <span className="text-xs text-amber">{ex.statusReason}</span>}</div>
          <Tabs tabs={[['work', 'Workspace'], ...(isAdmin ? [['admin', 'Admin']] : [])]} value={tab} onChange={setTab} />
          {tab === 'work' ? <Workspace /> : <Admin />}
        </>
      )}
      {!ex && !isAdmin && <p className="mt-4 text-xs text-faint">Fees are settled directly with clients in this version.</p>}
      {(meta.data || !edit) && <ProfileForm key={String(edit)} open={edit} onClose={() => setEdit(false)} meta={meta.data} initial={ex} onDone={() => me.reload()} />}
    </>
  )
}
