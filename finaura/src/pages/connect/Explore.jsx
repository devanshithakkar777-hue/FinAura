import { useState } from 'react'
import { Sparkles, Search } from 'lucide-react'
import { Card, FormModal, Notice, Row, useAction } from '../../components/kit.jsx'
import { Button, Chip, Empty, Glass, Modal, PageHeader, Skeletons } from '../../components/ui.jsx'
import { api } from '../../lib/api.js'
import { go, useApi, useAuth, useRoute } from '../../lib/hooks.jsx'
import { KIND_LABEL, TierChip, Verified, availText } from './common.jsx'

function ExpertCard({ x, reasons, cautions, onOpen }) {
  const { money } = useAuth()
  return (
    <button onClick={() => onOpen(x.id ?? x.expertId)} className="text-left">
      <Glass lift flat className="h-full p-5">
        <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{x.name}</div><Verified /></div><TierChip trust={x.trust} /></div>
        <p className="mt-2 text-sm text-muted">{x.headline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5"><Chip>{x.capacityInfo?.label ?? x.capacity}</Chip>{(x.languages ?? []).map(l => <Chip key={l}>{l}</Chip>)}</div>
        {x.fee != null && <div className="mt-3 text-xs text-faint">{x.feeModel === 'free_first' ? 'First session free · then ' : ''}{money.full(x.fee)}/session · {x.yearsExperience} yrs</div>}
        {reasons?.length > 0 && <ul className="mt-3 grid gap-1 text-[12px] text-muted">{reasons.map(r => <li key={r}>✓ {r}</li>)}</ul>}
        {cautions?.length > 0 && <ul className="mt-2 grid gap-1 text-[12px] text-amber">{cautions.map(r => <li key={r}>! {r}</li>)}</ul>}
      </Glass>
    </button>
  )
}

function ExpertModal({ id, onClose, question }) {
  const { money } = useAuth(), d = useApi(`/connect/experts/${id}`, { enabled: !!id }), meta = useApi('/connect/meta'), { run } = useAction(), [book, setBook] = useState(false)
  const e = d.data?.expert
  return (
    <Modal open={!!id} onClose={onClose} title={e?.name ?? 'Expert'} wide>
      {!e ? <Skeletons rows={2} h={80} /> : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2"><Verified /><TierChip trust={d.data.trust} /><Chip>{e.capacityInfo.label}</Chip>{e.registration && <Chip>{e.registration}</Chip>}</div>
          <p className="text-sm">{e.bio}</p>
          <div className="grid gap-3 sm:grid-cols-2"><Card title="What they can do" flat><p className="text-[13px] text-muted">{e.capacityInfo.can}</p></Card><Card title="What they cannot" flat><p className="text-[13px] text-muted">{e.capacityInfo.cannot}</p></Card></div>
          <Card title="Disclosures" flat><Row label="Fees" value={<span className="max-w-[60%] text-right text-[13px]">{e.feeDisclosure}</span>} /><Row label="Conflicts of interest" value={<span className="max-w-[60%] text-right text-[13px]">{e.conflictsDisclosure}</span>} /><Row label="Credentials" value={<span className="max-w-[60%] text-right text-[13px]">{e.credentials}</span>} /><Row label="Hours (IST)" value={<span className="max-w-[60%] text-right text-[13px]">{availText(e.availability)}</span>} /></Card>
          <Card title="How the trust score is built" flat><p className="text-[13px] text-muted">{d.data.trust.explain?.verdict ?? ''}</p>{d.data.trust.explain?.why?.map(w => <p key={w} className="text-[12px] text-faint">• {w}</p>)}</Card>
          {d.data.reviews.length > 0 && <Card title="Reviews" flat>{d.data.reviews.map((r, i) => <div key={i} className="border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--stroke)' }}><b>{'★'.repeat(r.rating)}</b> {r.body}</div>)}</Card>}
          <Notice>{meta.data?.notice}</Notice>
          <Button variant="primary" size="lg" onClick={() => setBook(true)}>Book a session · {money.full(e.fee)}{e.feeModel === 'free_first' ? ' (first is free)' : ''}</Button>
          <FormModal open={book} onClose={() => setBook(false)} title={`Book ${e.name}`} submitLabel="Send request" wide
            onSubmit={v => run(() => api.post('/connect/consultations', { expertId: e.id, kind: v.kind, scheduledFor: v.scheduledFor ? new Date(v.scheduledFor).toISOString() : null, topic: v.topic, question: v.question, intake: {}, originalAdvice: v.originalAdvice || undefined }), { ok: 'Request sent. Nothing about your finances is shared yet.', reload: false }).then(r => { if (r) go(`/connect/sessions?id=${r.consultation.id}`) })}
            initial={{ question: question ?? '' }}
            fields={[{ k: 'kind', label: 'Format', options: meta.data?.kinds.map(k => [k, KIND_LABEL[k]]) ?? [], noBlank: true, def: 'chat' }, { k: 'scheduledFor', label: 'Preferred time', type: 'datetime-local', hint: `Needed for chat, audio and video. Expert hours (IST): ${availText(e.availability)}` }, { k: 'topic', label: 'Topic', req: true, max: 120 }, { k: 'question', label: 'What do you want help with?', textarea: true, req: true, max: 1500 }, { k: 'originalAdvice', label: 'For a second opinion: paste the advice you received', textarea: true, max: 4000 }]} />
        </div>
      )}
    </Modal>
  )
}

export default function Explore() {
  const { params } = useRoute(), meta = useApi('/connect/meta'), { run, busy } = useAction()
  const [q, setQ] = useState(params.q ?? ''), [filters, setFilters] = useState({ category: '', language: '', nri: false }), [m, setM] = useState(null), [open, setOpen] = useState(null)
  const qs = new URLSearchParams(Object.entries({ category: filters.category, language: filters.language, nri: filters.nri ? 'true' : '' }).filter(([, v]) => v))
  const list = useApi(`/connect/experts?${qs}`)
  const match = async () => { const r = await run(() => api.post('/connect/match', { question: q.trim(), nri: filters.nri || undefined, language: filters.language || undefined }), { reload: false }); if (r) setM(r) }
  return (
    <>
      <PageHeader eyebrow="FinAura Connect" title="Find a verified expert" sub="Describe what you need. We suggest verified professionals, show their credentials and conflicts upfront, and you decide what — if anything — to share." />
      <Glass flat className="mb-6 p-5">
        <div className="flex flex-col gap-3 sm:flex-row"><input className="field flex-1" placeholder="e.g. Should I choose the old or new tax regime? Which funds for retirement?" value={q} onChange={e => setQ(e.target.value)} maxLength={800} /><Button variant="primary" loading={busy} disabled={q.trim().length < 5} onClick={match}><Sparkles size={16} />Suggest experts</Button></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="field !w-auto !py-1.5 text-sm" value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{Object.entries(meta.data?.categories ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="field !w-auto !py-1.5 text-sm" value={filters.language} onChange={e => setFilters({ ...filters, language: e.target.value })}><option value="">Any language</option>{['English', 'Hindi', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Kannada'].map(l => <option key={l}>{l}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={filters.nri} onChange={e => setFilters({ ...filters, nri: e.target.checked })} />NRI-friendly</label>
        </div>
      </Glass>
      {m && <div className="mb-8 grid gap-4"><Notice tone={m.need.wantsPersonalAdvice ? 'warn' : 'info'}>{m.notice}</Notice><div className="t-eyebrow">Suggested for your question</div>
        {m.matches.length === 0 ? <Empty icon={Search} title="No verified expert matches yet" body="Try broader wording or remove filters." /> : <div className="grid gap-4 md:grid-cols-2">{m.matches.map(x => <ExpertCard key={x.expertId} x={{ ...x, id: x.expertId }} reasons={x.reasons} cautions={x.cautions} onOpen={setOpen} />)}</div>}
        <p className="text-xs text-faint">{m.aiNotice}</p></div>}
      <div className="t-eyebrow mb-3">All verified experts</div>
      {list.loading && !list.data ? <Skeletons rows={2} h={140} /> : list.data?.experts.length === 0 ? <Empty title="No experts listed yet" body="Experts appear here after FinAura reviews their credentials." /> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{list.data.experts.map(x => <ExpertCard key={x.id} x={x} onOpen={setOpen} />)}</div>}
      <ExpertModal key={open} id={open} onClose={() => setOpen(null)} question={q} />
    </>
  )
}
