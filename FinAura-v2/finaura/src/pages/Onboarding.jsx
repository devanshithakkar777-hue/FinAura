import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Backdrop, Logo } from '../components/Shell.jsx'
import { Button, Glass } from '../components/ui.jsx'
import { go, useAuth } from '../lib/hooks.jsx'
import { api, errorMessage } from '../lib/api.js'

const QUESTIONS = [
  { q: 'Your portfolio drops 20% in a month. What do you do?', o: ['Sell everything to stop the pain', 'Sell some to sleep better', 'Hold and wait it out', 'Buy more at lower prices'] },
  { q: 'How long until you need most of this money?', o: ['Under 3 years', '3–7 years', '7–15 years', '15+ years'] },
  { q: 'Which outcome would you pick?', o: ['Guaranteed +4% a year', 'Likely +8%, could lose 10%', 'Likely +12%, could lose 25%', 'Possibly +18%, could lose 40%'] },
  { q: 'How would you describe your investing experience?', o: ['Brand new', 'A little — mostly funds', 'Comfortable with stocks', 'Experienced across asset classes'] },
]

export default function Onboarding() {
  const { setUser } = useAuth()
  const [i, setI] = useState(0), [ans, setAns] = useState([]), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [res, setRes] = useState(null)
  const pick = v => {
    const next = [...ans]; next[i] = v; setAns(next)
    if (i < QUESTIONS.length - 1) setTimeout(() => setI(i + 1), 220)
  }
  const finish = async () => {
    setBusy(true); setErr('')
    try { const r = await api.post('/me/onboarding', { answers: ans }); setUser(r.user); setRes(r) } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Backdrop />
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center"><Logo size={30} /></div>
        {res ? (
          <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}>
            <Glass flat className="p-9 text-center">
              <div className="t-eyebrow">Your risk profile</div>
              <div className="t-display grad-text mt-3 text-5xl font-extrabold">{res.profile}</div>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">We'll use this to judge whether your portfolio matches how much risk you can really stomach, and to calibrate behavioural alerts. You earned +100 XP.</p>
              <Button className="mt-7" size="lg" variant="primary" onClick={() => go('/dashboard')}>Enter FinAura <ArrowRight size={16} /></Button>
            </Glass>
          </motion.div>
        ) : (
          <>
            <div className="mb-5 flex gap-1.5">{QUESTIONS.map((_, k) => <div key={k} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--stroke)' }}><motion.div className="h-full" style={{ background: 'linear-gradient(90deg, var(--a1), var(--a3))' }} animate={{ width: k <= i && (k < i || ans[k]) ? '100%' : k === i ? '35%' : '0%' }} /></div>)}</div>
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: .3 }}>
                <Glass flat className="p-7">
                  <div className="t-eyebrow">Question {i + 1} of {QUESTIONS.length}</div>
                  <h2 className="t-display mb-5 mt-2 text-xl font-semibold leading-snug">{QUESTIONS[i].q}</h2>
                  <div className="grid gap-2.5">
                    {QUESTIONS[i].o.map((o, k) => {
                      const on = ans[i] === k + 1
                      return (
                        <button key={o} onClick={() => pick(k + 1)} className="rounded-2xl border px-4 py-3.5 text-left text-sm font-medium transition-all hover:-translate-y-0.5"
                          style={{ borderColor: on ? 'var(--a1)' : 'var(--stroke)', background: on ? 'color-mix(in srgb, var(--a1) 16%, transparent)' : 'var(--glass-b)', boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--a1) 20%, transparent)' : undefined }}>{o}</button>
                      )
                    })}
                  </div>
                  {err && <div role="alert" className="mt-4 text-sm text-rose">{err}</div>}
                  <div className="mt-6 flex justify-between">
                    <Button size="sm" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft size={14} />Back</Button>
                    {i === QUESTIONS.length - 1 && <Button variant="primary" loading={busy} disabled={ans.filter(Boolean).length < QUESTIONS.length} onClick={finish}>See my profile</Button>}
                  </div>
                </Glass>
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  )
}
