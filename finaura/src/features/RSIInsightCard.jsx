import React from 'react';
import { motion } from 'framer-motion';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ASSETS = [
  { name: 'S&P 500 ETF', ticker: 'SPY',   rsi: 62, price: '$478.32' },
  { name: 'Bitcoin',     ticker: 'BTC',   rsi: 74, price: '$67,420' },
  { name: 'Nifty 50',   ticker: 'NIFTY', rsi: 48, price: '₹22,147' },
];

function getMomentum(rsi) {
  if (rsi > 70) return { label: 'Overbought', color: '#ef4444', bg: 'bg-red-500/10',    text: 'text-red-500',    icon: TrendingUp,   border: 'border-red-500/20' };
  if (rsi < 30) return { label: 'Oversold',   color: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: TrendingDown, border: 'border-emerald-500/20' };
  return         { label: 'Neutral',     color: '#6366f1', bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  icon: Minus,        border: 'border-indigo-500/20' };
}

function RSIGauge({ rsi, color }) {
  return (
    <div className="relative mt-2">
      <div className="h-2 rounded-full overflow-hidden flex">
        <div className="w-[30%] h-full bg-emerald-500/20 rounded-l-full" />
        <div className="flex-1 h-full bg-slate-100 dark:bg-white/[0.06]" />
        <div className="w-[30%] h-full bg-red-500/20 rounded-r-full" />
      </div>
      <motion.div
        initial={{ left: '50%' }}
        animate={{ left: `${rsi}%` }}
        transition={{ duration: 1, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 shadow-md"
        style={{ background: color }}
      />
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-emerald-500 font-semibold">Oversold</span>
        <span className="text-[9px] text-slate-400">Neutral</span>
        <span className="text-[9px] text-red-400 font-semibold">Overbought</span>
      </div>
    </div>
  );
}

export default function RSIInsightCard({ assets = ASSETS }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Activity size={13} className="text-indigo-400" />
        </div>
        <div>
          <div className="t-section text-slate-900 dark:text-white">RSI Signals</div>
          <div className="t-meta">Momentum indicators</div>
        </div>
      </div>
      <div className="space-y-5">
        {assets.map((a, i) => {
          const m = getMomentum(a.rsi);
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className={`p-3 rounded-xl border ${m.border} ${m.bg}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{a.name}</span>
                  <span className="text-xs text-slate-400 ml-1.5">{a.ticker}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <m.icon size={12} className={m.text} />
                  <span className={`text-xs font-bold ${m.text}`}>{m.label}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>RSI <span className="font-bold text-slate-800 dark:text-slate-200">{a.rsi}</span></span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{a.price}</span>
              </div>
              <RSIGauge rsi={a.rsi} color={m.color} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
