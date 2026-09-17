import React from 'react';
import { motion } from 'framer-motion';
import { Bell, Menu, Search, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useAuth } from '../../context/AuthContext';

const PAGE_META = {
  dashboard: { title: 'Dashboard',  sub: 'Your financial overview' },
  portfolio: { title: 'Portfolio',  sub: 'Holdings & performance' },
  markets:   { title: 'Markets',    sub: 'Live prices & trends' },
  ai:        { title: 'AI Advisor', sub: 'Behavioral intelligence' },
  rewards:   { title: 'Rewards',    sub: 'XP, achievements & leaderboard' },
  settings:  { title: 'Settings',   sub: 'Account & preferences' },
};

export default function Navbar({ page, onMenuOpen }) {
  const { dark, toggle }  = useTheme();
  const { user, profile } = useAuth();
  const meta    = PAGE_META[page] || PAGE_META.dashboard;
  const initials = (profile?.name || user?.displayName || 'AK')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-16 border-b border-slate-200 dark:border-white/[0.06] flex items-center justify-between px-6 bg-white/80 dark:bg-[#080b14]/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuOpen}
          aria-label="Open menu"
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          <Menu size={16} />
        </button>
        <motion.div
          key={page}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{meta.title}</div>
          <div className="text-xs text-slate-400 hidden sm:block">{meta.sub}</div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="Search"
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.09] transition-all"
        >
          <Search size={14} />
        </button>

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.09] transition-all"
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="relative">
          <button
            aria-label="Notifications"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.09] transition-all"
          >
            <Bell size={14} />
          </button>
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-white dark:border-[#080b14]" />
        </div>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold ml-1 cursor-pointer select-none">
          {initials}
        </div>
      </div>
    </header>
  );
}
