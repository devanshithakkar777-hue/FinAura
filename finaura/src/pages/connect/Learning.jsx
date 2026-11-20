import { useState } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { Card, FormModal, Notice, useAction } from '../../components/kit.jsx'
import { Button, Chip, Empty, Glass, PageHeader, Skeletons } from '../../components/ui.jsx'
import { api } from '../../lib/api.js'
import { go, useApi, useAuth, useRoute } from '../../lib/hooks.jsx'
import { Verified, when } from './common.jsx'

export function Academy() {
  const { money } = useAuth(), a = useApi('/connect/academy'), { run } = useAction()
  return (
    <>
      <PageHeader eyebrow="FinAura Connect" title="Academy" sub="Webinars, courses and articles from verified experts. General education, not personal advice." />
      {a.loading && !a.data ? <Skeletons rows={2} h={120} /> : a.data?.items.length === 0 ? <Empty title="Nothing scheduled yet" body="Verified experts publish webinars and courses here." /> : (
        <div className="grid gap-4 md:grid-cols-2">{a.data.items.map(i => (
          <Card key={i.id} title={i.title} actions={<Chip>{i.kind}</Chip>}>
            <p className="text-sm text-muted">{i.description}</p>
            <div className="mt-3 text-xs text-faint">{i.expert} <Verified /> · {i.startsAt ? when(i.startsAt) : 'self-paced'} · {i.fee ? money.full(i.fee) : 'free'} · {i.enrolled} enrolled</div>
            <Button className="mt-4" size="sm" variant={i.enrolledByMe ? 'ghost' : 'primary'} disabled={i.enrolledByMe} onClick={() => run(() => api.post(`/connect/academy/${i.id}/enroll`), { ok: 'You are enrolled', reload: false }).then(() => a.reload())}>{i.enrolledByMe ? 'Enrolled' : 'Enrol'}</Button>
          </Card>))}</div>
      )}
    </>
  )
}

export function Community() {
  const { params } = useRoute(), meta = useApi('/connect/meta'), [cat, setCat] = useState(''), list = useApi(`/connect/community${cat ? `?category=${cat}` : ''}`), { run } = useAction(), [ask, setAsk] = useState(false)
  const q = useApi(`/connect/community/${params.id}`, { enabled: !!params.id }), me = useApi('/connect/expert/me'), [ans, setAns] = useState(false)
  if (params.id) {
    const d = q.data
    return (
      <>
        <PageHeader eyebrow="FinAura Connect" title="Community" />
        <button onClick={() => go('/connect/community')} className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} />All questions</button>
        {!d ? <Skeletons rows={2} h={100} /> : (
          <div className="grid gap-4">
            <Glass flat className="p-6"><Chip>{meta.data?.categories[d.question.category]}</Chip><h2 className="t-display mt-2 text-xl font-bold">{d.question.title}</h2><p className="mt-2 text-sm text-muted">{d.question.body}</p><div className="mt-2 text-xs text-faint">Asked by {d.question.askedBy}</div></Glass>
            {d.answers.map(a => <Card key={a.id}><p className="text-sm">{a.body}</p><div className="mt-3 text-xs text-faint">{a.expert} <Verified /> · {a.capacity}</div></Card>)}
            {d.answers.length === 0 && <p className="text-sm text-muted">No expert has answered yet.</p>}
            {me.data?.expert?.status === 'verified' && <Button onClick={() => setAns(true)}>Answer as a verified expert</Button>}
            <Notice>{d.notice}</Notice>
            <FormModal open={ans} onClose={() => setAns(false)} title="Your answer" onSubmit={v => run(() => api.post(`/connect/community/${params.id}/answers`, { body: v.body }), { ok: 'Posted', reload: false }).then(() => q.reload())} fields={[{ k: 'body', label: 'General information only — no personal advice', textarea: true, req: true, max: 2000 }]} />
          </div>
        )}
      </>
    )
  }
  return (
    <>
      <PageHeader eyebrow="FinAura Connect" title="Community Q&A" sub="Ask anonymously. Only verified experts can answer, and every answer shows their credentials." actions={<Button variant="primary" onClick={() => setAsk(true)}><Plus size={16} />Ask a question</Button>} />
      <div className="mb-5"><select className="field !w-auto" value={cat} onChange={e => setCat(e.target.value)}><option value="">All topics</option>{Object.entries(meta.data?.categories ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {list.loading && !list.data ? <Skeletons rows={3} h={70} /> : list.data?.questions.length === 0 ? <Empty title="No questions yet" body="Be the first to ask." /> : <div className="grid gap-3">{list.data.questions.map(x => <button key={x.id} className="text-left" onClick={() => go(`/connect/community?id=${x.id}`)}><Glass lift flat className="flex items-center justify-between gap-3 p-5"><div><div className="font-semibold">{x.title}</div><div className="text-xs text-faint">{meta.data?.categories[x.category]} · {x.askedBy}</div></div><Chip tone={x.answers ? 'good' : undefined}>{x.answers} answer{x.answers === 1 ? '' : 's'}</Chip></Glass></button>)}</div>}
      <FormModal open={ask} onClose={() => setAsk(false)} title="Ask the community" submitLabel="Post" onSubmit={v => run(() => api.post('/connect/community', { title: v.title, body: v.body, category: v.category, anonymous: !!v.anonymous }), { ok: 'Posted', reload: false }).then(() => list.reload())}
        fields={[{ k: 'title', label: 'Your question', req: true, max: 140 }, { k: 'body', label: 'Details', textarea: true, max: 1500, hint: 'Do not post account numbers, PAN, Aadhaar or other identifiers.' }, { k: 'category', label: 'Topic', options: Object.entries(meta.data?.categories ?? {}), req: true }, { k: 'anonymous', label: 'Post anonymously', type: 'checkbox', def: true }]} />
    </>
  )
}

