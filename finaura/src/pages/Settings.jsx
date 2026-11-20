import { useState } from 'react'
import { Download, Trash2, ShieldCheck, RotateCcw } from 'lucide-react'
import { Button, Chip, Field, Glass, Modal, PageHeader } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { go, useApi, useAuth, useToasts } from '../lib/hooks.jsx'

const Section = ({ title, sub, children }) => (
  <Glass flat className="mb-5 p-6"><h2 className="t-display text-lg font-semibold">{title}</h2>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}<div className="mt-5">{children}</div></Glass>
)

export default function Settings() {
  const { user, setUser, logout } = useAuth(); const { push } = useToasts()
  const consents = useApi('/me/consents')
  const [p, setP] = useState({ name: user.name, currency: user.currency, riskProfile: user.riskProfile ?? '', handle: user.handle ?? '' })
  const [busy, setBusy] = useState(''), [err, setErr] = useState({})
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' })
  const [del, setDel] = useState(false), [delPw, setDelPw] = useState('')

  const save = async e => {
    e.preventDefault(); setBusy('p'); setErr({})
    const body = { name: p.name, currency: p.currency, ...(p.riskProfile ? { riskProfile: p.riskProfile } : {}), ...(p.handle ? { handle: p.handle } : {}) }
    try { const r = await api.patch('/me', body); setUser(r.user); push({ kind: 'success', text: 'Profile saved.' }) } catch (x) { setErr({ p: errorMessage(x) }) } finally { setBusy('') }
  }
  const changePw = async e => {
    e.preventDefault(); setBusy('pw'); setErr({})
    try { await api.post('/me/password', pw); setPw({ currentPassword: '', newPassword: '' }); push({ kind: 'success', text: 'Password changed. Other devices were signed out.' }) } catch (x) { setErr({ pw: errorMessage(x) }) } finally { setBusy('') }
  }
  const exportData = async () => {
    setBusy('x')
    try {
      const data = await api.get('/me/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `finaura-export-${new Date().toISOString().slice(0, 10)}.json` }); a.click(); URL.revokeObjectURL(url)
    } catch (x) { push({ kind: 'error', text: errorMessage(x) }) } finally { setBusy('') }
  }
  const remove = async e => {
    e.preventDefault(); setBusy('d'); setErr({})
    try { await api.del('/me', { password: delPw }); setDel(false); await logout() } catch (x) { setErr({ d: errorMessage(x) }); setBusy('') }
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings & privacy" />
      <Section title="Profile">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required maxLength={80} value={p.name} onChange={e => setP({ ...p, name: e.target.value })} />
          <Field label="Email" value={user.email} disabled hint={user.emailVerified ? 'Verified' : 'Not verified yet'} />
          <Field label="Currency"><select className="field" value={p.currency} onChange={e => setP({ ...p, currency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Risk profile" hint="Change by retaking the quiz.">
            <div className="flex gap-2"><input className="field" value={user.riskProfile ?? 'Not set'} disabled /><Button type="button" onClick={() => go('/onboarding')} aria-label="Retake quiz"><RotateCcw size={15} /></Button></div>
          </Field>
          <Field label="Public handle" hint="Letters, numbers, underscore. Shown only on the leaderboard if you opt in." value={p.handle} minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" onChange={e => setP({ ...p, handle: e.target.value })} />
          <div className="flex items-end"><Button variant="primary" loading={busy === 'p'} type="submit">Save changes</Button></div>
          {err.p && <div role="alert" className="text-sm text-rose sm:col-span-2">{err.p}</div>}
        </form>
      </Section>

      <Section title="Password">
        <form onSubmit={changePw} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={e => setPw({ ...pw, currentPassword: e.target.value })} />
          <Field label="New password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters." value={pw.newPassword} onChange={e => setPw({ ...pw, newPassword: e.target.value })} />
          {err.pw && <div role="alert" className="text-sm text-rose sm:col-span-2">{err.pw}</div>}
          <div><Button loading={busy === 'pw'} type="submit">Change password</Button></div>
        </form>
      </Section>

      <Section title="Your data" sub="You own it. Download everything we hold, or delete your account and all of it permanently.">
        <div className="mb-5 flex flex-wrap gap-2 text-sm">
          {(consents.data?.consents ?? []).map(c => <Chip key={c.purpose + c.created_at} tone={c.granted ? 'good' : undefined}><ShieldCheck size={12} />{c.purpose.replace(/_/g, ' ')} · v{c.version}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button loading={busy === 'x'} onClick={exportData}><Download size={15} />Export my data</Button>
          <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={15} />Delete account</Button>
        </div>
      </Section>

      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?">
        <form onSubmit={remove} className="grid gap-4">
          <p className="text-sm text-muted">This permanently deletes your profile, trades, goals and history. It cannot be undone. Enter your password to confirm.</p>
          <Field label="Password" type="password" required autoComplete="current-password" value={delPw} onChange={e => setDelPw(e.target.value)} />
          {err.d && <div role="alert" className="text-sm text-rose">{err.d}</div>}
          <div className="flex gap-2"><Button type="button" onClick={() => setDel(false)}>Cancel</Button><Button variant="danger" loading={busy === 'd'} type="submit">Delete forever</Button></div>
        </form>
      </Modal>
    </>
  )
}
