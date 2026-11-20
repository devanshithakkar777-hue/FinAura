import { Bot, Check, X } from 'lucide-react'
import { Card, Explain, Notice, useAction } from '../components/kit.jsx'
import { Button, Chip, Empty, PageHeader, Skeletons } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useApi } from '../lib/hooks.jsx'

const TONE = { proposed: 'warn', approved: 'info', done: 'good', dismissed: undefined }

export default function CoPilot() {
  const t = useApi('/copilot'), { run, busy } = useAction()
  const decide = (id, decision) => run(() => api.post(`/copilot/${id}/decision`, { decision }), { reload: false }).then(() => t.reload())
  const refresh = () => run(() => api.post('/copilot/refresh'), { reload: false, ok: r => `${r.proposed} suggestion${r.proposed === 1 ? '' : 's'} ready` }).then(() => t.reload())
  const tasks = t.data?.tasks ?? []
  return (
    <>
      <PageHeader eyebrow="Proposes. You decide." title="Co-Pilot" sub="A short list of next steps drawn from your data. It never moves money or changes anything — you carry out each step yourself." actions={<Button variant="primary" loading={busy} onClick={refresh}><Bot size={16} />Refresh suggestions</Button>} />
      {t.loading && !t.data ? <Skeletons rows={3} h={110} /> : tasks.length === 0 ? <Empty icon={Bot} title="No suggestions yet" body="Press Refresh to scan your data for the most useful next steps." /> : (
        <div className="grid gap-4">{tasks.map(x => (
          <Card key={x.id} title={x.title} actions={<Chip tone={TONE[x.status]}>{x.status}</Chip>}>
            <ul className="grid gap-1.5 text-sm text-muted">{x.detail.why?.map(w => <li key={w}>• {w}</li>)}</ul>
            {x.detail.steps?.length > 0 && <div className="mt-3"><div className="t-eyebrow mb-1">Steps</div><ol className="grid gap-1 text-sm">{x.detail.steps.map((s, i) => <li key={s}>{i + 1}. {s}</li>)}</ol></div>}
            {x.detail.impact && <p className="mt-3 text-xs text-good">{x.detail.impact}</p>}
            <details className="mt-3"><summary className="cursor-pointer text-xs text-faint">Why this suggestion</summary><Explain className="mt-2" e={x.detail.explain} /></details>
            {x.status === 'proposed' && <div className="mt-4 flex gap-2"><Button variant="primary" size="sm" onClick={() => decide(x.id, 'approve')}><Check size={14} />Plan to do this</Button><Button size="sm" onClick={() => decide(x.id, 'dismiss')}><X size={14} />Dismiss</Button></div>}
            {x.status === 'approved' && <div className="mt-4"><Button size="sm" onClick={() => decide(x.id, 'done')}><Check size={14} />Mark done</Button></div>}
          </Card>))}</div>
      )}
      <div className="mt-5"><Notice>{t.data?.note}</Notice></div>
    </>
  )
}
