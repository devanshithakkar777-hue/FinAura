import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, PieChart, TrendingUp, Brain, Trophy, Settings, Zap, X, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { levelFromXP } from '../../services/scoringEngine';

const NAV = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'portfolio', label: 'Portfolio',  icon: PieChart },
  { id: 'markets',   label: 'Markets',    icon: TrendingUp },
  { id: 'ai',        label: 'AI Advisor', icon: Brain, dot: true },
  { id: 'rewards',   label: 'Rewards',    icon: Trophy },
];

export default function Sidebar({ active, onNav, open, onClose }) {
  const { user, profile, logout } = useAuth();

  const displayName = profile?.name || user?.displayName || 'Investor';
  const initials    = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const xp            = profile?.xp ?? 0;
  const { level, nextThreshold } = levelFromXP(xp);
  const prevThreshold = level > 1 ? [0, 500, 1500, 3000, 5500, 9000, 13500, 19500, 27000, 36000][level - 1] : 0;
  const xpInLevel     = xp - prevThreshold;
  const xpForLevel    = nextThreshold - prevThreshold;
  const xpPct         = xpForLevel > 0 ? Math.min(100, Math.round((xpInLevel / xpForLevel) * 100)) : 100;

  const LEVEL_LABELS = ['', 'Beginner', 'Learner', 'Saver', 'Investor', 'Trader', 'Analyst', 'Investor', 'Expert', 'Pro', 'Legend'];
  const levelLabel   = LEVEL_LABELS[level] ?? 'Investor';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed top-0 left-0 h-full w-[220px] z-50 bg-white dark:bg-[#0d1117] border-r border-slate-200 dark:border-white/[0.06] flex flex-col py-5 px-3 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            F
          </div>
          <span className="text-slate-900 dark:text-white font-bold text-lg tracking-tight">
            Fin<span className="text-indigo-500">Aura</span>
          </span>
          <button
            onClick={onClose}
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* XP strip — driven by real profile data */}
        <div className="mx-1 mb-5 p-3 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/[0.12]">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={11} className="text-amber-400" />
            <span className="text-[11px] font-semibold text-amber-400">
              Level {level} · {levelLabel}
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${xpPct}%` }}
              transition={{ duration: 1, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-400 rounded-full"
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5">
            {xp.toLocaleString()} / {nextThreshold.toLocaleString()} XP
          </div>
        </div>

        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 mb-2">
          Main
        </span>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon, dot }) => (
            <button
              key={id}
              onClick={() => { onNav(id); onClose(); }}
              className={`relative flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active === id
                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {active === id && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-full"
                />
              )}
              <Icon size={15} />
              {label}
              {dot && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </nav>

        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 mt-5 mb-2">
          Account
        </span>
        <button
          onClick={() => { onNav('settings'); onClose(); }}
          className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            active === 'settings'
              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Settings size={15} /> Settings
        </button>

        {/* User row */}
        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{displayName}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.email || 'Pro Investor'}</div>
            </div>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
