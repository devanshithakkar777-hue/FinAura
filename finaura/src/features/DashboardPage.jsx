import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, Shield, Brain, Zap, ArrowUpRight, ArrowDownRight, ChevronRight, Flame } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import HealthScoreRing from './HealthScoreRing';
import PortfolioAllocation from './PortfolioAllocation';
import RSIInsightCard from './RSIInsightCard';
import AIInsightCard from './AIInsightCard';
import RebalanceSimulator from './RebalanceSimulator';
import LeaderboardCard from './LeaderboardCard';
import { PORTFOLIO_HISTORY, HOLDINGS } from '../data/mockData';
import { computeHealthScore } from '../services/scoringEngine';

const MOCK_ASSETS = [
  { type: 'equity',     value: 53388, volatility: 'Moderate', rsi_value: 62 },
  { type: 'crypto',     value: 29660, volatility: 'High',     rsi_value: 74 },
  { type: 'mutualFund', value: 21355, volatility: 'Low',      rsi_value: 48 },
  { type: 'bond',       value: 14237, volatility: 'Low',      rsi_value: 42 },
];
const SCORES = computeHealthScore(MOCK_ASSETS, 'Moderate');

const STATS = [
  { label: 'Total Value',    value: '$118,640', changeLabel: '+18.6% this year',   up: true,  icon: TrendingUp, ic: 'text-indigo-400',  ib: 'bg-indigo-500/10' },
  { label: "Today's P&L",   value: '+$1,284',  changeLabel: '+1.09% today',        up: true,  icon: Zap,        ic: 'text-emerald-400', ib: 'bg-emerald-500/10' },
  { label: 'Health Score',  value: `${SCORES.total} / 100`, changeLabel: '+12 pts this month', up: true, icon: Shield, ic: 'text-blue-400', ib: 'bg-blue-500/10' },
  { label: 'Behavior Score',value: '74 / 100', changeLabel: 'Moderate discipline', up: false, icon: Brain,      ic: 'text-violet-400',  ib: 'bg-violet-500/10' },
];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-white/[0.08] rounded-xl px-3.5 py-2.5 shadow-xl">
      <div className="t-meta mb-1">{label}</div>
      <div className="text-base font-bold text-slate-900 dark:text-white">${payload[0].value.toLocaleString()}</div>
    </div>
  );
};

export default function DashboardPage() {
  const [range, setRange] = useState('1Y');

  return (
    <div className="space-y-5">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07, ease: [0.4, 0, 0.2, 1] }}
            className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200 dark:border-white/[0.07] rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-default"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="t-meta uppercase tracking-wide">{s.label}</span>
              <div className={`w-8 h-8 rounded-lg ${s.ib} flex items-center justify-center`}>
                <s.icon size={14} className={s.ic} />
              </div>
            </div>
            <div className="t-headline text-2xl text-slate-900 dark:text-white mb-1.5">{s.value}</div>
            <div className={`flex items-center gap-1 text-xs font-medium ${s.up ? 'text-emerald-500' : 'text-slate-400'}`}>
              {s.up && <ArrowUpRight size={12} />}{s.changeLabel}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart + Health Ring */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card animate delay={0.1} className="lg:col-span-2 p-5">
          <CardHeader title="Portfolio Performance" subtitle="12-month overview"
            action={
              <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl p-1">
                {['1M', '3M', '6M', '1Y'].map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${range === r ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {r}
                  </button>
                ))}
              </div>
            }
          />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PORTFOLIO_HISTORY} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="v" stroke="#818cf8" strokeWidth={2.5} fill="url(#pg)" dot={false} activeDot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card animate delay={0.12} className="p-5 flex flex-col items-center">
          <CardHeader title="Portfolio Health" subtitle="Live multi-ring scoring" className="w-full" />
          <HealthScoreRing score={SCORES.total} subScores={SCORES} />
          <div className="w-full mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
            <PortfolioAllocation />
          </div>
        </Card>
      </div>

      {/* AI Insights + RSI + Rebalance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card animate delay={0.14} className="p-5">
          <CardHeader title="AI Insights" subtitle="Behavior-driven analysis" action={<Badge variant="purple">3 new</Badge>} />
          <AIInsightCard />
        </Card>
        <Card animate delay={0.16} className="p-5">
          <RSIInsightCard />
        </Card>
        <Card animate delay={0.18} className="p-5">
          <RebalanceSimulator />
        </Card>
      </div>

      {/* Holdings + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card animate delay={0.2} className="lg:col-span-2 p-5">
          <CardHeader title="Holdings" subtitle={`${HOLDINGS.length} assets · $118,640 total`} action={<Button size="sm">View All <ChevronRight size={12} /></Button>} />
          <div className="space-y-1">
            {HOLDINGS.map((a, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.05 }}
                className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${a.color}22` }}>{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{a.name}</div>
                  <div className="t-meta">{a.ticker} · {a.alloc}% allocation</div>
                </div>
                <div className="w-20 hidden sm:block">
                  <div className="h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${a.alloc}%`, background: a.color }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">${a.current.toLocaleString()}</div>
                  <div className={`text-xs font-medium flex items-center justify-end gap-0.5 ${a.current >= a.avgCost ? 'text-emerald-500' : 'text-red-400'}`}>
                    {a.current >= a.avgCost ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {(((a.current - a.avgCost) / a.avgCost) * 100).toFixed(1)}%
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        <Card animate delay={0.22} className="p-5">
          <CardHeader title="Leaderboard" subtitle="Ranked by health score" action={<Badge variant="green"><Flame size={9} /> Top 5%</Badge>} />
          <LeaderboardCard />
        </Card>
      </div>
    </div>
  );
}
