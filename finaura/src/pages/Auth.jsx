import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, Brain, Users, Orbit, Lock } from 'lucide-react'
import { Backdrop, Logo } from '../components/Shell.jsx'
import { Button, Field, Glass } from '../components/ui.jsx'
import { go, useAuth, useRoute } from '../lib/hooks.jsx'
import { api, errorMessage } from '../lib/api.js'

function Frame({ children, title, sub }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Backdrop />
      <motion.div initial={{ opacity: 0, y: 24, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .6, ease: [.2, .8, .2, 1] }} className="w-full max-w-[430px]">
        <button onClick={() => go('/')} className="mx-auto mb-7 block"><Logo size={32} /></button>
        <Glass flat className="p-7 sm:p-8">
          <h1 className="t-display text-2xl font-bold">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
          <div className="mt-6">{children}</div>
        </Glass>
      </motion.div>
    </div>
  )
}

const useForm = () => {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const run = fn => async e => { e.preventDefault(); setError(''); setBusy(true); try { await fn() } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) } }
  return { error, busy, run, setError }
}
const Err = ({ children }) => children ? <div role="alert" className="mb-4 rounded-xl border px-3 py-2 text-sm text-rose" style={{ borderColor: 'color-mix(in srgb, var(--rose) 35%, transparent)', background: 'color-mix(in srgb, var(--rose) 8%, transparent)' }}>{children}</div> : null

export function Login() {
  const { login } = useAuth(); const f = useForm()
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  return (
    <Frame title="Welcome back" sub="Sign in to see what your decisions are worth.">
      <form onSubmit={f.run(async () => { await login(email, password); go('/dashboard') })} className="grid gap-4">
        <Err>{f.error}</Err>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <Button variant="primary" size="lg" loading={f.busy} type="submit">Sign in <ArrowRight size={16} /></Button>
        <div className="flex justify-between text-sm"><a href="#/forgot" className="text-muted hover:text-ink">Forgot password?</a><a href="#/register" className="font-semibold text-a1">Create account</a></div>
      </form>
    </Frame>
  )
}

export function Register() {
  const { register } = useAuth(); const f = useForm()
  const [v, setV] = useState({ name: '', email: '', password: '' }), [terms, setTerms] = useState(false)
  const set = k => e => setV(s => ({ ...s, [k]: e.target.value }))
  return (
    <Frame title="Create your account" sub="Free. No card. Your data stays yours — export or delete it any time.">
      <form onSubmit={f.run(async () => { if (!terms) throw new Error('Please accept the terms and privacy notice to continue.'); await register({ ...v, acceptTerms: true }); go('/onboarding') })} className="grid gap-4">
        <Err>{f.error}</Err>
        <Field label="Name" autoComplete="name" required value={v.name} onChange={set('name')} />
        <Field label="Email" type="email" autoComplete="email" required value={v.email} onChange={set('email')} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." value={v.password} onChange={set('password')} />
        <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--a1)]" />
          <span>I agree to the Terms and the Privacy Notice, and understand FinAura gives educational analysis, not personalised investment advice.</span>
        </label>
        <Button variant="primary" size="lg" loading={f.busy} type="submit">Create account <ArrowRight size={16} /></Button>
        <div className="text-center text-sm text-muted">Already have one? <a href="#/login" className="font-semibold text-a1">Sign in</a></div>
      </form>
    </Frame>
  )
}

export function Forgot() {
  const f = useForm(); const [email, setEmail] = useState(''), [sent, setSent] = useState(false)
  return (
    <Frame title="Reset your password" sub="We'll email you a single-use link.">
      {sent ? <p className="text-sm text-muted">If an account exists for <b className="text-ink">{email}</b>, a reset link is on its way. It expires in an hour.</p> : (
        <form onSubmit={f.run(async () => { await api.post('/auth/password-reset/request', { email }); setSent(true) })} className="grid gap-4">
          <Err>{f.error}</Err>
          <Field label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="primary" size="lg" loading={f.busy} type="submit">Send link</Button>
        </form>
      )}
      <div className="mt-5 text-center text-sm"><a href="#/login" className="text-muted hover:text-ink">Back to sign in</a></div>
    </Frame>
  )
}

export function Reset() {
  const { params } = useRoute(); const f = useForm()
  const [password, setPassword] = useState(''), [done, setDone] = useState(false)
  return (
    <Frame title="Choose a new password">
      {done ? <div className="grid gap-4"><p className="text-sm text-muted">Password updated. You can sign in now.</p><Button variant="primary" onClick={() => go('/login')}>Sign in</Button></div> : (
        <form onSubmit={f.run(async () => { await api.post('/auth/password-reset/confirm', { token: params.token ?? '', password }); setDone(true) })} className="grid gap-4">
          <Err>{f.error}</Err>
          <Field label="New password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." value={password} onChange={e => setPassword(e.target.value)} />
          <Button variant="primary" size="lg" loading={f.busy} type="submit">Update password</Button>
        </form>
      )}
    </Frame>
  )
}

export function Verify() {
  const { params } = useRoute(); const { refresh } = useAuth()
  const [state, setState] = useState('working'), [msg, setMsg] = useState('')
  useEffect(() => {
    let off = false
    api.post('/auth/verify', { token: params.token ?? '' })
      .then(() => { if (!off) { setState('ok'); refresh() } })
      .catch(e => { if (!off) { setState('err'); setMsg(errorMessage(e)) } })
    return () => { off = true }
  }, [params.token, refresh])
  return (
    <Frame title={state === 'ok' ? 'Email verified' : state === 'err' ? 'Link problem' : 'Verifying…'}>
      <p className="mb-5 text-sm text-muted">{state === 'ok' ? 'Thanks — your email is confirmed.' : state === 'err' ? msg : 'One moment.'}</p>
      <Button variant="primary" onClick={() => go('/dashboard')}>Continue</Button>
    </Frame>
  )
}

/* ── Landing ── */
export function Landing() {
  const feats = [
    { icon: Brain, t: 'Behavioral Alpha', d: 'The exact rupee cost (or gain) of your own buy and sell decisions versus simply staying the course.' },
    { icon: ShieldCheck, t: 'Pre-mortem check', d: 'Before you hit sell, see your own history in similar moments, a cooldown if it looks emotional, and a checklist.' },
    { icon: Users, t: 'Advisory council', d: 'Risk, Behavior, Tax and Goals agents debate your question — and show you where they disagree.' },
    { icon: Orbit, t: 'Digital twin', d: 'Simulate your future through crashes — as a disciplined investor and as you actually behave.' },
  ]
  return (
    <div className="min-h-screen">
      <Backdrop />
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo size={30} />
        <div className="flex gap-2"><Button size="sm" onClick={() => go('/login')}>Sign in</Button><Button size="sm" variant="primary" onClick={() => go('/register')}>Get started</Button></div>
      </nav>
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-14 text-center sm:pt-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
          <span className="chip mb-6"><span className="pulse-dot text-a3" /> Behavior-first investing intelligence</span>
          <h1 className="t-display text-[40px] font-extrabold leading-[1.04] sm:text-[72px]">Your biggest risk<br />isn't the market.<br /><span className="grad-text">It's you.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">FinAura measures what your own decisions have cost you, stops the next emotional mistake before you make it, and shows you the future you're building — in plain numbers.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="primary" onClick={() => go('/register')}>Start free <ArrowRight size={17} /></Button>
            <Button size="lg" onClick={() => go('/login')}>I have an account</Button>
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-faint"><Lock size={12} /> Encrypted sessions · export or delete your data anytime · educational analysis, not advice</p>
        </motion.div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {feats.map((f, i) => (
          <motion.div key={f.t} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .08, duration: .6 }}>
            <Glass lift className="h-full p-6">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--a1) 30%, transparent), color-mix(in srgb, var(--a3) 20%, transparent))' }}><f.icon size={20} /></div>
              <h3 className="t-display text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </Glass>
          </motion.div>
        ))}
      </section>
      <footer className="pb-10 text-center text-xs text-faint">© {new Date().getFullYear()} FinAura · Educational analysis only. Not investment, tax or legal advice.</footer>
    </div>
  )
}
