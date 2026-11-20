import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2, UserRoundCheck } from 'lucide-react'
import { Notice, useAction } from '../components/kit.jsx'
import { Button, Glass, PageHeader } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { go, useApi } from '../lib/hooks.jsx'

const IDEAS = ['How is my net worth looking?', 'What happens if the market falls 30%?', 'Am I on track for retirement?', 'Do I have enough emergency cover?', 'Which tax regime suits me?', 'Where is my money going?']

export default function Assistant() {
  const h = useApi('/assistant/history'), { run, busy } = useAction(), [extra, setMsgs] = useState([]), [cleared, setCleared] = useState(false), [q, setQ] = useState(''), end = useRef(null)
  const past = cleared || !h.data ? [] : h.data.messages.map(m => ({ role: m.role, content: m.content, escalation: m.meta?.escalation?.recommended ? m.meta.escalation : null }))
  const msgs = [...past, ...extra]
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])
  const send = async text => {
    if (!text.trim()) return
    setMsgs(m => [...m, { role: 'user', content: text }]); setQ('')
    const r = await run(() => api.post('/assistant', { message: text }), { reload: false })
    setMsgs(m => [...m, r ? { role: 'assistant', content: r.reply, escalation: r.escalation?.recommended ? r.escalation : null, actions: r.actions, llm: r.llm } : { role: 'assistant', content: 'Sorry, I could not answer that just now.' }])
  }
  const list = msgs
  return (
    <>
      <PageHeader eyebrow="Ask anything" title="Assistant" sub="Answers come from your own numbers. It will never tell you what to buy or sell." actions={list.length > 0 && <Button size="sm" onClick={async () => { await run(() => api.del('/assistant/history'), { reload: false, ok: 'Conversation cleared' }); setCleared(true); setMsgs([]) }}><Trash2 size={14} />Clear</Button>} />
      <Glass flat className="flex min-h-[55vh] flex-col p-4 sm:p-5">
        <div className="flex-1 space-y-4 overflow-y-auto pb-2" aria-live="polite">
          {list.length === 0 && <div className="grid h-full place-items-center py-10 text-center"><div><Sparkles className="mx-auto mb-3 text-a2" /><p className="mb-4 text-sm text-muted">Try one of these</p><div className="flex max-w-xl flex-wrap justify-center gap-2">{IDEAS.map(i => <button key={i} className="chip" onClick={() => send(i)}>{i}</button>)}</div></div></div>}
          {list.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed" style={m.role === 'user' ? { background: 'linear-gradient(120deg, var(--a1), var(--a2))', color: '#fff' } : { background: 'var(--glass-a)', border: '1px solid var(--stroke)' }}>
                {m.content}
                {m.role === 'assistant' && m.llm === false && <div className="mt-1 text-[11px] text-faint">Rule-based answer from your data</div>}
                {m.actions?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.actions.map((a, j) => <button key={j} className="chip" onClick={() => a.path && go(a.path)}>{a.label ?? a}</button>)}</div>}
                {m.escalation && <div className="mt-3 rounded-xl p-3 text-[13px]" style={{ border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)', background: 'color-mix(in srgb, var(--gold) 8%, transparent)' }}><div className="mb-1 flex items-center gap-2 font-semibold"><UserRoundCheck size={15} style={{ color: 'var(--gold)' }} />A human should weigh in</div><p className="text-muted">{m.escalation.reason}</p><Button size="sm" className="mt-2" onClick={() => go(`/connect?q=${encodeURIComponent(list[i - 1]?.content ?? '')}`)}>Find a {m.escalation.category}</Button></div>}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-faint">Thinking…</div>}
          <div ref={end} />
        </div>
        <form onSubmit={e => { e.preventDefault(); send(q) }} className="mt-3 flex gap-2"><input className="field flex-1" placeholder="Ask about your money…" maxLength={800} value={q} onChange={e => setQ(e.target.value)} /><Button variant="primary" loading={busy} type="submit" aria-label="Send"><Send size={16} /></Button></form>
      </Glass>
      <div className="mt-4"><Notice>Educational guidance based on what you entered. Regulated advice (what to buy or sell, tax filing, insurance selection) comes from licensed professionals — FinAura Connect can introduce you, with your consent.</Notice></div>
    </>
  )
}
