import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertTriangle, TrendingUp, Shield, ChevronRight } from 'lucide-react';

const INSIGHTS = [
  {
    id: 1, icon: AlertTriangle, accent: '#f59e0b',
    bg: 'bg-amber-500/[0.07]', border: 'border-amber-500/20',
    tag: 'Behavior Alert', title: 'Panic Sell Pattern Detected',
    summary: 'You sold BTC during 3 of the last 4 dips.',
    detail: 'This pattern has cost you approximately $2,400 in missed recovery gains over 6 months. Holding through short-term volatility is statistically more profitable for assets with strong fundamentals.',
    impact: '-$2,400 opportunity cost',
  },
  {
    id: 2, icon: Sparkles, accent: '#6366f1',
    bg: 'bg-indigo-500/[0.07]', border: 'border-indigo-500/20',
    tag: 'AI Suggestion', title: 'Rebalancing Opportunity',
    summary: 'Your crypto allocation is significantly higher than your risk profile suggests.',
    detail: 'Reducing crypto exposure from 25% to 17% and moving $4,200 into bonds would improve your health score by an estimated 11 points and reduce max drawdown risk by 18%.',
    impact: '+11 health score pts',
  },
  {
    id: 3, icon: Shield, accent: '#10b981',
    bg: 'bg-emerald-500/[0.07]', border: 'border-emerald-500/20',
    tag: 'Positive Signal', title: 'Diversification Improving',
    summary: 'Your diversification score improved 12 pts this month.',
    detail: 'Consistent SIP contributions across 4 asset classes are paying off. Maintaining this discipline for 6 more months will move you into the top 20% of investors in your cohort.',
    impact: '+12 diversification pts',
  },
];

function InsightRow({ ins, onExpand, expanded }) {
  return (
    <motion.div
      layout
      className={`rounded-xl border ${ins.border} ${ins.bg} overflow-hidden cursor-pointer`}
      onClick={() => onExpand(ins.id)}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${ins.accent}18` }}>
          <ins.icon size={14} style={{ color: ins.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">{ins.title}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: `${ins.accent}18`, color: ins.accent }}>
              {ins.tag}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{ins.summary}</p>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-2 pt-2 border-t border-slate-200/60 dark:border-white/[0.06]">
                  {ins.detail}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${ins.accent}18`, color: ins.accent }}>
                    {ins.impact}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ChevronRight size={13} className={`text-slate-300 dark:text-slate-600 shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
      </div>
    </motion.div>
  );
}

export default function AIInsightCard({ insights = INSIGHTS }) {
  const [expanded, setExpanded] = useState(null);
  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Sparkles size={12} className="text-indigo-400" />
        </div>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">AI Analysis</span>
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">
          {insights.length} insights
        </span>
      </div>
      {insights.map(ins => (
        <InsightRow key={ins.id} ins={ins} onExpand={toggle} expanded={expanded === ins.id} />
      ))}
    </div>
  );
}
