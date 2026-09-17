import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Zap, Star, Target, TrendingUp, Shield, Brain, BarChart3 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';

const ACHIEVEMENTS = [
  { emoji: '🚀', name: 'First Investment',   desc: 'Made your first trade',       unlocked: true  },
  { emoji: '💎', name: 'Diamond Hands',      desc: 'Held through a 20% dip',      unlocked: true  },
  { emoji: '🎯', name: 'Goal Setter',        desc: 'Set 3 financial goals',        unlocked: true  },
  { emoji: '📈', name: 'Bull Run',           desc: 'Portfolio up 15% in a month',  unlocked: true  },
  { emoji: '🧠', name: 'Behavior Master',    desc: 'Score 90+ behavior rating',    unlocked: false },
  { emoji: '🌍', name: 'Global Diversifier', desc: 'Invest in 5+ countries',       unlocked: false },
  { emoji: '⚡', name: 'SIP Streak',         desc: '12 consecutive SIP months',    unlocked: false },
  { emoji: '🏆', name: 'Top 1%',             desc: 'Outperform 99% of users',      unlocked: false },
  { emoji: '🔮', name: 'AI Whisperer',       desc: 'Follow 10 AI recommendations', unlocked: false },
];

const CHALLENGES = [
  { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', title: 'Hold BTC for 30 days', reward: '+500 XP', progress: 18, total: 30 },
  { icon: Shield,     color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  title: 'Rebalance portfolio',  reward: '+300 XP', progress: 0,  total: 1  },
  { icon: Brain,      color: 'text-amber-500',   bg: 'bg-amber-500/10',   title: 'Read 5 AI insights',   reward: '+200 XP', progress: 3,  total: 5  },
  { icon: Target,     color: 'text-cyan-500',    bg: 'bg-cyan-500/10',    title: 'Set a savings goal',   reward: '+150 XP', progress: 0,  total: 1  },
];

const LEADERBOARD = [
  { rank: 1, name: 'Priya S.',  xp: 12400, badge: '🏆', you: false },
  { rank: 2, name: 'Rahul M.',  xp: 11200, badge: '🥈', you: false },
  { rank: 3, name: 'Alex K.',   xp: 9800,  badge: '🥉', you: true  },
  { rank: 4, name: 'Sneha T.',  xp: 8900,  badge: '',   you: false },
  { rank: 5, name: 'Arjun P.',  xp: 7600,  badge: '',   you: false },
];

const CHALLENGE_COLORS = {
  'text-emerald-500': '#22c55e',
  'text-indigo-400':  '#6366f1',
  'text-amber-500':   '#f59e0b',
  'text-cyan-500':    '#06b6d4',
};

export default function Rewards() {
  return (
    <div className="space-y-4 page-enter">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total XP"     value="9,800"  change={1}  changeLabel="Level 7 · Investor"  icon={Zap}    delay={0}    iconColor="text-amber-400"  iconBg="bg-amber-500/10"  />
        <StatCard label="Achievements" value="4 / 9"  change={0}  changeLabel="5 remaining"         icon={Trophy} delay={0.05} iconColor="text-indigo-400" iconBg="bg-indigo-500/10" />
        <StatCard label="Leaderboard"  value="#3"     change={0}  changeLabel="Top 5% of users"     icon={Star}   delay={0.1}  iconColor="text-violet-400" iconBg="bg-violet-500/10" />
      </div>

      {/* Level Progress */}
      <Card animate delay={0.1} className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Level 7 · Investor</div>
            <div className="text-xs text-slate-400 mt-0.5">3,400 XP to next level</div>
          </div>
          <Badge variant="amber"><Zap size={10} /> 9,800 XP</Badge>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-slate-400">Lv 7</span>
          <div className="flex-1 h-2.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '74%' }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
              style={{ boxShadow: '0 0 12px rgba(245,158,11,0.4)' }}
            />
          </div>
          <span className="text-xs text-slate-400">Lv 8</span>
        </div>
        <div className="text-xs text-slate-400 text-center mb-4">9,800 / 13,200 XP</div>
        <div className="flex flex-wrap gap-2">
          {['Consistent Investor', 'Crypto Explorer', 'Goal Achiever', 'AI Follower'].map((tag, i) => (
            <Badge key={i} variant="purple">{tag}</Badge>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Challenges */}
        <Card animate delay={0.15} className="p-5">
          <CardHeader title="Active Challenges" subtitle="Complete to earn XP" action={<Badge variant="cyan">4 active</Badge>} />
          <div className="space-y-3">
            {CHALLENGES.map((c, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]"
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-8 h-8 rounded-xl ${c.bg} ${c.color} flex items-center justify-center shrink-0`}>
                    <c.icon size={14} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</div>
                    <div className="text-xs text-slate-400">{c.progress}/{c.total} completed</div>
                  </div>
                  <Badge variant="amber"><Zap size={9} /> {c.reward}</Badge>
                </div>
                <div className="h-1.5 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.progress / c.total) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                    className="h-full rounded-full"
                    style={{ background: CHALLENGE_COLORS[c.color] ?? '#6366f1' }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* Leaderboard */}
        <Card animate delay={0.2} className="p-5">
          <CardHeader title="Leaderboard" subtitle="This month" action={<Badge variant="green">Top 5%</Badge>} />
          <div className="space-y-2">
            {LEADERBOARD.map((u, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.06 }}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all ${
                  u.you
                    ? 'bg-indigo-500/[0.08] border border-indigo-500/20'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <div className="w-6 text-center text-sm">
                  {u.badge || <span className="text-xs text-slate-400">#{u.rank}</span>}
                </div>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {u.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 text-sm font-medium text-slate-900 dark:text-white">
                  {u.name} {u.you && <span className="text-[10px] text-indigo-400 font-semibold">· You</span>}
                </div>
                <div className="text-sm font-bold text-amber-500">{u.xp.toLocaleString()} XP</div>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* Achievements */}
      <Card animate delay={0.25} className="p-5">
        <CardHeader title="Achievements" subtitle="Unlock by hitting milestones" action={<Badge variant="purple">4 / 9 unlocked</Badge>} />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {ACHIEVEMENTS.map((a, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.04 }}
              className={`flex flex-col items-center text-center p-3.5 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
                a.unlocked
                  ? 'bg-indigo-500/[0.06] border-indigo-500/20 dark:border-indigo-500/25'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/[0.05] opacity-50'
              }`}
            >
              <div className="text-2xl mb-2">{a.unlocked ? a.emoji : '🔒'}</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white mb-1">{a.name}</div>
              <div className="text-[10px] text-slate-400 leading-tight">{a.desc}</div>
              {a.unlocked && <Badge variant="green" className="mt-2">Unlocked</Badge>}
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}
