import { useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutDashboard, ShieldAlert, Users, Orbit, Brain, Wallet, Target, Trophy, Settings, Sun, Moon, LogOut, Sparkles, MailWarning, MessageCircle, Bot, FlaskConical, HeartPulse, Landmark, Compass, Receipt, CreditCard, Home, ScrollText, GraduationCap, Handshake, CalendarCheck, Library, MessagesSquare, Briefcase, Menu, BadgeCheck } from 'lucide-react'
import { go, useAuth, useRoute, useTheme, useToasts } from '../lib/hooks.jsx'
import { api, errorMessage } from '../lib/api.js'
import { Modal, Toasts, cx } from './ui.jsx'

export const GROUPS = [
  { label: 'Core', items: [
    { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { path: '/check', label: 'Check a trade', icon: ShieldAlert, hot: true },
    { path: '/council', label: 'Council', icon: Users },
    { path: '/twin', label: 'Digital twin', icon: Orbit },
    { path: '/behavior', label: 'Behavior', icon: Brain },
    { path: '/portfolio', label: 'Portfolio', icon: Wallet },
    { path: '/goals', label: 'Goals', icon: Target },
  ] },
  { label: 'Intelligence', items: [
    { path: '/assistant', label: 'Assistant', icon: MessageCircle, hot: true },
    { path: '/copilot', label: 'Co-Pilot', icon: Bot },
    { path: '/intelligence', label: 'Simulator', icon: FlaskConical },
    { path: '/wellness', label: 'Wellness', icon: HeartPulse },
  ] },
  { label: 'Money', items: [
    { path: '/wealth', label: 'Wealth', icon: Landmark },
    { path: '/plan', label: 'Planning', icon: Compass },
    { path: '/wallet', label: 'Wallet', icon: Receipt },
    { path: '/tax', label: 'Tax', icon: Landmark },
    { path: '/credit', label: 'Credit', icon: CreditCard },
  ] },
  { label: 'Life', items: [
    { path: '/family', label: 'Family', icon: Home },
    { path: '/estate', label: 'Estate', icon: ScrollText },
    { path: '/learn', label: 'Learn', icon: GraduationCap },
    { path: '/rewards', label: 'Rewards', icon: Trophy },
  ] },
  { label: 'FinAura Connect', gold: true, items: [
    { path: '/connect', label: 'Find an expert', icon: Handshake },
    { path: '/connect/sessions', label: 'My sessions', icon: CalendarCheck },
    { path: '/connect/academy', label: 'Academy', icon: Library },
    { path: '/connect/community', label: 'Community', icon: MessagesSquare },
    { path: '/connect/expert', label: 'For experts', icon: BadgeCheck },
  ] },
  { label: 'Business', items: [{ path: '/advisor', label: 'Advisors & API', icon: Briefcase }] },
]
export const NAV = GROUPS.flatMap(g => g.items)
const MOBILE = ['/dashboard', '/assistant', '/twin', '/connect']
export const activePath = path => NAV.filter(n => path === n.path || path.startsWith(`${n.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.path ?? (path.startsWith('/settings') ? '/settings' : '')

export function Backdrop() {
  return (<><div className="aurora" aria-hidden><i /><i /><i /></div><div className="grid-lines" aria-hidden /></>)
}

export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M5.5 35 20 4.5 34.5 35" fill="none" stroke="var(--gold)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="26" width="3.4" height="7" rx=".6" fill="var(--gold)" /><rect x="18.4" y="22" width="3.4" height="11" rx=".6" fill="var(--gold)" /><rect x="22.8" y="17.5" width="3.4" height="15.5" rx=".6" fill="var(--gold)" />
    </svg>
  )
}
export function Logo({ size = 28, connect }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size + 4} />
      <div className="leading-none"><span className="t-display text-[19px] font-semibold tracking-tight">FinAura</span>{connect && <div className="t-mono mt-1" style={{ color: 'var(--gold)' }}>Connect</div>}</div>
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
  const active = activePath(path), [more, setMore] = useState(false), zone = path.startsWith('/connect') ? 'zone-connect' : ''
  return (
    <div className={cx('min-h-screen', zone)}>
      <Backdrop />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col p-4 md:flex">
        <div className="glass flat flex h-full flex-col p-4" style={{ borderRadius: 28 }}>
          <button onClick={() => go('/dashboard')} className="mb-3 mt-1 px-2 text-left" aria-label="FinAura home"><Logo connect={zone === 'zone-connect'} /></button>
          <hr className="gold-rule mb-1" />
          <nav className="-mr-2 flex flex-1 flex-col overflow-y-auto pr-2" aria-label="Main">
            {GROUPS.map(g => (
              <div key={g.label}>
                <div className="nav-label" style={g.gold ? { color: 'var(--gold)' } : undefined}>{g.label}</div>
                {g.items.map(n => {
                  const on = active === n.path
                  return (
                    <button key={n.path} onClick={() => go(n.path)} aria-current={on ? 'page' : undefined}
                      className={cx('relative flex w-full items-center gap-3 rounded-xl px-3.5 py-1.5 text-left text-[13px] font-medium transition-colors', on ? 'text-ink' : 'text-muted hover:text-ink')}>
                      {on && <motion.span layoutId="navpill" className="absolute inset-0 rounded-2xl" style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--a1) 22%, transparent), color-mix(in srgb, var(--a3) 10%, transparent))', border: '1px solid var(--stroke-strong)' }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                      <n.icon size={17} className="relative" style={on ? { color: g.gold ? 'var(--gold)' : 'var(--a3)' } : undefined} />
                      <span className="relative flex-1">{n.label}</span>
                      {n.hot && <span className="relative"><Sparkles size={12} className="text-a2" /></span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="hr divider my-3" />
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
            const on = active === n.path || (n.path === '/connect' && path.startsWith('/connect'))
            return (
              <button key={n.path} onClick={() => go(n.path)} aria-current={on ? 'page' : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold" style={{ color: on ? 'var(--ink)' : 'var(--faint)' }}>
                {on && <motion.span layoutId="mobpill" className="absolute inset-0 rounded-2xl" style={{ background: 'var(--glass-a)', border: '1px solid var(--stroke-strong)' }} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <n.icon size={19} className="relative" style={on ? { color: 'var(--a3)' } : undefined} />
                <span className="relative">{n.label.split(' ')[0]}</span>
              </button>
            )
          })}
          <button onClick={() => setMore(true)} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold text-faint" aria-label="More"><Menu size={19} /><span>More</span></button>
        </div>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="All of FinAura" wide>
        <div className="grid gap-5">
          {GROUPS.map(g => (
            <div key={g.label}><div className="t-eyebrow mb-2" style={g.gold ? { color: 'var(--gold)' } : undefined}>{g.label}</div>
              <div className="grid grid-cols-2 gap-2">{g.items.map(n => <button key={n.path} onClick={() => { setMore(false); go(n.path) }} className="btn btn-ghost justify-start"><n.icon size={16} />{n.label}</button>)}</div>
            </div>
          ))}
        </div>
      </Modal>
      <Toasts />
    </div>
  )
}
