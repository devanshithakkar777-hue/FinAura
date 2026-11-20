import { useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, Flame, Lock, Medal } from 'lucide-react'
import { Bar } from '../components/charts.jsx'
import { Button, Chip, ErrorState, Glass, PageHeader, Skeletons } from '../components/ui.jsx'
import { api, errorMessage } from '../lib/api.js'
import { useApi, useAuth, useToasts } from '../lib/hooks.jsx'

export default function Rewards() {
  const { user, setUser } = useAuth(); const { push } = useToasts()
  const g = useApi('/gamification'), lb = useApi('/leaderboard')
  const [busy, setBusy] = useState(false)
  const toggle = async () => {
    setBusy(true)
    try { const r = await api.patch('/me', { leaderboardOptIn: !user.leaderboardOptIn }); setUser(r.user); lb.reload() }
    catch (e) { push({ kind: 'error', text: errorMessage(e) }) } finally { setBusy(false) }
  }
  if (g.loading && !g.data) return <><PageHeader title="Rewards" /><Skeletons rows={3} /></>
  if (g.error) return <ErrorState message={g.message} onRetry={g.reload} />
  const d = g.data, span = (d.nextThreshold ?? d.xp) - d.prevThreshold, into = d.xp - d.prevThreshold
  const unlocked = d.achievements.filter(a => a.unlocked).length

  return (
    <>
      <PageHeader eyebrow="Progress" title="Rewards" sub="Points for good habits — logging trades, diversifying, pausing before you panic. Never for trading more." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Glass className="p-7 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><div className="t-eyebrow">Level {d.level}</div><div className="t-display grad-text mt-1 text-4xl font-extrabold">{d.levelName}</div></div>
            <div className="flex gap-3"><Chip tone="warn"><Flame size={13} />{d.streakDays}-day streak</Chip><Chip tone="info">{d.xp.toLocaleString()} XP</Chip></div>
          </div>
          <div className="mt-6"><Bar value={d.nextThreshold ? into / span : 1} height={10} color="var(--a2)" /><div className="mt-2 text-xs text-faint">{d.nextThreshold ? `${(d.nextThreshold - d.xp).toLocaleString()} XP to next level` : 'Max level reached'}</div></div>
          {d.recent?.length > 0 && <ul className="mt-6 grid gap-2 text-sm">{d.recent.slice(0, 5).map((r, i) => <li key={i} className="flex justify-between text-muted"><span>{r.label}</span><b className="t-num text-good">+{r.points}</b></li>)}</ul>}
        </Glass>
        <Glass className="p-6">
          <div className="t-eyebrow mb-3 flex items-center gap-2"><Crown size={13} />Leaderboard</div>
          {lb.data?.optedIn ? (
            <ol className="grid gap-2 text-sm">{lb.data.leaders.slice(0, 7).map((l, i) => (
              <li key={l.handle ?? i} className="flex items-center gap-3 rounded-xl px-2 py-1.5" style={l.isYou ? { background: 'color-mix(in srgb, var(--a1) 14%, transparent)' } : undefined}><span className="w-5 text-faint t-num">{i + 1}</span><span className="flex-1 truncate">{l.handle}</span><b className="t-num">{l.xp}</b></li>
            ))}{lb.data.leaders.length === 0 && <li className="text-muted">You're the first on the board.</li>}</ol>
          ) : <p className="text-sm leading-relaxed text-muted">Opt in to appear by a handle you choose. Only your handle and XP are shown — never portfolio values.</p>}
          {!user.handle && !user.leaderboardOptIn && <p className="mt-3 text-xs text-faint">Set a handle in Settings first.</p>}
          <Button className="mt-4" size="sm" loading={busy} disabled={!user.handle && !user.leaderboardOptIn} onClick={toggle}>{user.leaderboardOptIn ? 'Leave leaderboard' : 'Join leaderboard'}</Button>
        </Glass>
      </div>
      <div className="mb-3 mt-8 flex items-center justify-between"><div className="t-eyebrow">Achievements</div><span className="text-xs text-faint">{unlocked}/{d.achievements.length}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.achievements.map((a, i) => (
          <motion.div key={a.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .03 }}>
            <Glass flat={!a.unlocked} lift={a.unlocked} className="flex gap-3.5 p-4" style={a.unlocked ? undefined : { opacity: .55 }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: a.unlocked ? 'linear-gradient(135deg, var(--a1), var(--a2))' : 'var(--glass-a)', color: a.unlocked ? '#fff' : 'var(--faint)' }}>{a.unlocked ? <Medal size={20} /> : <Lock size={18} />}</div>
              <div><div className="text-sm font-semibold">{a.title}</div><div className="mt-0.5 text-xs leading-relaxed text-muted">{a.desc}</div></div>
            </Glass>
          </motion.div>
        ))}
      </div>
    </>
  )
}
