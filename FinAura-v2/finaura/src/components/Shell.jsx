import { motion } from 'framer-motion'
import { LayoutDashboard, ShieldAlert, Users, Orbit, Brain, Wallet, Target, Trophy, Settings, Sun, Moon, LogOut, Sparkles, MailWarning } from 'lucide-react'
import { go, useAuth, useRoute, useTheme, useToasts } from '../lib/hooks.jsx'
import { api, errorMessage } from '../lib/api.js'
import { Toasts, cx } from './ui.jsx'

export const NAV = [
  { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/check', label: 'Check a trade', icon: ShieldAlert, hot: true },
  { path: '/council', label: 'Council', icon: Users },
  { path: '/twin', label: 'Digital twin', icon: Orbit },
  { path: '/behavior', label: 'Behavior', icon: Brain },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/rewards', label: 'Rewards', icon: Trophy },
]
const MOBILE = ['/dashboard', '/check', '/council', '/twin', '/portfolio']

export function Backdrop() {
  return (<><div className="aurora" aria-hidden><i /><i /><i /></div><div className="grid-lines" aria-hidden /></>)
}

export function Logo({ size = 28 }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c8cff" /><stop offset=".55" stopColor="#b36bff" /><stop offset="1" stopColor="#35e0c5" /></linearGradient></defs>
        <rect width="32" height="32" rx="10" fill="url(#lg)" />
        <path d="M8 21c3-1 4-9 8-9s4 6 8 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="24" cy="18" r="2.2" fill="#fff" />
      </svg>
      <span className="t-display text-[19px] font-bold tracking-tight">Fin<span className="grad-text">Aura</span></span>
    </div>
  )
}

function VerifyBanner() {
  const { user } = useAuth()
  const { push } = useToasts()
  if (!user || user.emailVerified) return null
  const resend = async () => {
    try { await api.post('/auth/resend-verification'); push({ kind: 'success', text: 'Verification email sent.' }) }
    catch (e) { push({ kind: 'error', text: errorMessage(e) }) }
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--amber) 35%, transparent)', background: 'color-mix(in srgb, var(--amber) 8%, transparent)' }}>
      <MailWarning size={16} className="text-amber" />
      <span className="flex-1 text-muted">Please verify your email so you can recover your account.</span>
      <button onClick={resend} className="font-semibold text-amber hover:underline">Resend link</button>
    </div>
  )
}

export function Shell({ children }) {
  const { path } = useRoute()
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const active = NAV.find(n => path.startsWith(n.path))?.path ?? (path.startsWith('/settings') ? '/settings' : '')
  return (
    <div className="min-h-screen">
      <Backdrop />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col p-4 md:flex">
        <div className="glass flat flex h-full flex-col p-4" style={{ borderRadius: 28 }}>
          <button onClick={() => go('/dashboard')} className="mb-7 mt-1 px-2 text-left"><Logo /></button>
          <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
            {NAV.map(n => {
              const on = active === n.path
              return (
                <button key={n.path} onClick={() => go(n.path)} aria-current={on ? 'page' : undefined}
                  className={cx('relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors', on ? 'text-ink' : 'text-muted hover:text-ink')}>
                  {on && <motion.span layoutId="navpill" className="absolute inset-0 rounded-2xl" style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--a1) 24%, transparent), color-mix(in srgb, var(--a3) 12%, transparent))', border: '1px solid var(--stroke-strong)' }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  <n.icon size={18} className="relative" style={on ? { color: 'var(--a3)' } : undefined} />
                  <span className="relative flex-1">{n.label}</span>
                  {n.hot && <span className="relative"><Sparkles size={13} className="text-a2" /></span>}
                </button>
              )
            })}
          </nav>
          <div className="hr divider mb-3" />
          <button onClick={() => go('/settings')} className={cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/5', active === '/settings' && 'bg-white/5')}>
            <div className="grid h-9 w-9 place-items-center rounded-xl font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--a1), var(--a2))' }}>{(user?.name ?? '?')[0].toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-faint">Lv {user?.level} · {user?.levelName}</div>
            </div>
            <Settings size={16} className="text-faint" />
          </button>
          <div className="mt-2 flex gap-2">
            <button onClick={toggle} className="btn btn-ghost btn-sm flex-1" aria-label="Toggle theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}{theme === 'dark' ? 'Light' : 'Dark'}</button>
            <button onClick={logout} className="btn btn-ghost btn-sm flex-1"><LogOut size={15} />Sign out</button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden" style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', background: 'color-mix(in srgb, var(--bg) 60%, transparent)' }}>
        <Logo size={26} />
        <div className="flex gap-2">
          <button onClick={toggle} className="btn btn-ghost btn-sm" aria-label="Toggle theme">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
          <button onClick={() => go('/settings')} className="btn btn-ghost btn-sm" aria-label="Settings"><Settings size={15} /></button>
        </div>
      </header>

      <main className="px-4 pb-32 pt-4 md:ml-[264px] md:px-10 md:pb-16 md:pt-10">
        <div className="mx-auto max-w-[1120px]">
          <VerifyBanner />
          <motion.div key={path} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>{children}</motion.div>
        </div>
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-30 md:hidden" aria-label="Main">
        <div className="glass flat flex justify-around p-1.5" style={{ borderRadius: 24 }}>
          {NAV.filter(n => MOBILE.includes(n.path)).map(n => {
            const on = active === n.path
            return (
              <button key={n.path} onClick={() => go(n.path)} aria-current={on ? 'page' : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold" style={{ color: on ? 'var(--ink)' : 'var(--faint)' }}>
                {on && <motion.span layoutId="mobpill" className="absolute inset-0 rounded-2xl" style={{ background: 'var(--glass-a)', border: '1px solid var(--stroke-strong)' }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <n.icon size={19} className="relative" style={on ? { color: 'var(--a3)' } : undefined} />
                <span className="relative">{n.label.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </nav>
      <Toasts />
    </div>
  )
}
