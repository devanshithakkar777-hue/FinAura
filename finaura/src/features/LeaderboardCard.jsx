import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

const BADGE_STYLES = {
  'Diversification Pro': { color: '#818cf8', bg: 'rgba(129,140,248,0.12)', icon: '🎯' },
  'Risk Balanced':       { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)', icon: '⚖️' },
  'Volatility Warning':  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '⚡' },
  'Consistent Saver':    { color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', icon: '💎' },
  'Crypto Explorer':     { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '₿' },
};

function InvestorBadge({ label }) {
  const style = BADGE_STYLES[label] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: '🏅' };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: style.bg, color: style.color }}>
      {style.icon} {label}
    </span>
  );
}

const LEADERBOARD = [
  { rank: 1, name: 'Priya S.',  score: 94, xp: 12400, streak: 18, badge: '🏆', you: false, badges: ['Diversification Pro', 'Consistent Saver'] },
  { rank: 2, name: 'Rahul M.',  score: 91, xp: 11200, streak: 12, badge: '🥈', you: false, badges: ['Risk Balanced'] },
  { rank: 3, name: 'Alex K.',   score: 82, xp: 9800,  streak: 7,  badge: '🥉', you: true,  badges: ['Crypto Explorer'] },
  { rank: 4, name: 'Sneha T.',  score: 79, xp: 8900,  streak: 5,  badge: '',   you: false, badges: ['Volatility Warning'] },
  { rank: 5, name: 'Arjun P.',  score: 74, xp: 7600,  streak: 3,  badge: '',   you: false, badges: [] },
];

export default function LeaderboardCard({ data = LEADERBOARD }) {
  return (
    <div className="space-y-1.5">
      {data.map((u, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 + i * 0.07 }}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
            u.you
              ? 'bg-indigo-500/[0.08] border border-indigo-500/20'
              : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent'
          }`}
        >
          <div className="w-6 text-center shrink-0">
            {u.badge
              ? <span className="text-base">{u.badge}</span>
              : <span className="text-xs font-bold text-slate-400">#{u.rank}</span>
            }
          </div>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {u.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${u.you ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                {u.name}
              </span>
              {u.you && <span className="text-[9px] text-indigo-400 font-bold">YOU</span>}
            </div>
            {u.badges.length > 0 && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {u.badges.slice(0, 1).map(b => <InvestorBadge key={b} label={b} />)}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white">{u.score}</div>
            <div className="flex items-center gap-0.5 justify-end mt-0.5">
              <Flame size={9} className="text-orange-400 streak-pulse" />
              <span className="text-[9px] text-slate-400">{u.streak}d</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
