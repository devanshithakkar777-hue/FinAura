import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Sliders, RefreshCw } from 'lucide-react';
import { computeHealthScore } from '../../services/scoringEngine';

const DEFAULT = { equity: 45, crypto: 25, mutualFund: 18, bond: 12 };
const TOTAL   = 118640;
const YEARS   = [0,1,2,3,4,5,6,7,8,9,10];

const RATES = {
  conservative: { equity: 0.06, crypto: 0.05, mutualFund: 0.07, bond: 0.04 },
  moderate:     { equity: 0.09, crypto: 0.15, mutualFund: 0.10, bond: 0.04 },
  aggressive:   { equity: 0.12, crypto: 0.30, mutualFund: 0.12, bond: 0.04 },
};

function project(alloc, scenario) {
  const rates = RATES[scenario];
  return YEARS.map(yr => {
    const v = Object.entries(alloc).reduce((sum, [key, pct]) => {
      const r = rates[key] ?? 0.07;
      return sum + (TOTAL * pct / 100) * Math.pow(1 + r, yr);
    }, 0);
    return { yr, v: Math.round(v) };
  });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2 shadow-lg text-xs">
      <div className="text-slate-400 mb-1">Year {label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize text-slate-600 dark:text-slate-300">{p.name}</span>
          <span className="font-bold text-slate-900 dark:text-white ml-auto">
            ${(p.value / 1000).toFixed(0)}k
          </span>
        </div>
      ))}
    </div>
  );
};

const SLIDER_CONFIG = [
  { key: 'equity',     label: 'Equities',     color: '#818cf8' },
  { key: 'crypto',     label: 'Crypto',       color: '#fbbf24' },
  { key: 'mutualFund', label: 'Mutual Funds', color: '#6ee7b7' },
  { key: 'bond',       label: 'Bonds',        color: '#67e8f9' },
];

export default function RebalanceSimulator() {
  const [alloc, setAlloc]     = useState(DEFAULT);
  const [profile, setProfile] = useState('Moderate');

  /**
   * Update one slider and proportionally scale the others so
   * the total always equals 100%.
   */
  const update = (changedKey, rawVal) => {
    const newVal      = Math.max(0, Math.min(100, Number(rawVal)));
    const otherKeys   = SLIDER_CONFIG.map(s => s.key).filter(k => k !== changedKey);
    const otherTotal  = otherKeys.reduce((s, k) => s + alloc[k], 0);
    const remaining   = 100 - newVal;

    let scaled;
    if (otherTotal === 0) {
      // Edge case: all others are 0 — distribute remaining evenly
      const share = Math.floor(remaining / otherKeys.length);
      const extra  = remaining - share * otherKeys.length;
      scaled = Object.fromEntries(
        otherKeys.map((k, i) => [k, share + (i === 0 ? extra : 0)])
      );
    } else {
      // Proportional scaling
      scaled = Object.fromEntries(
        otherKeys.map(k => [k, Math.round((alloc[k] / otherTotal) * remaining)])
      );
      // Fix rounding drift so total is exactly 100
      const scaledSum = Object.values(scaled).reduce((s, v) => s + v, 0);
      const drift     = remaining - scaledSum;
      if (drift !== 0) {
        scaled[otherKeys[0]] = (scaled[otherKeys[0]] || 0) + drift;
      }
    }

    setAlloc({ ...scaled, [changedKey]: newVal });
  };

  const reset = () => setAlloc(DEFAULT);

  const assets = SLIDER_CONFIG.map(s => ({
    type:       s.key,
    value:      TOTAL * alloc[s.key] / 100,
    volatility: s.key === 'crypto' ? 'High' : s.key === 'equity' ? 'Moderate' : 'Low',
    rsi_value:  s.key === 'crypto' ? 74 : s.key === 'equity' ? 62 : 48,
  }));

  const scores = computeHealthScore(assets, profile);

  const chartData = useMemo(() => {
    const c = project(alloc, 'conservative');
    const m = project(alloc, 'moderate');
    const a = project(alloc, 'aggressive');
    return YEARS.map((yr, i) => ({
      yr,
      conservative: c[i].v,
      moderate:     m[i].v,
      aggressive:   a[i].v,
    }));
  }, [alloc]);

  const scoreColor = scores.total >= 80
    ? '#10b981'
    : scores.total >= 60
    ? '#6366f1'
    : '#f59e0b';

  const allocTotal = Object.values(alloc).reduce((s, v) => s + v, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Sliders size={13} className="text-indigo-400" />
        </div>
        <div className="flex-1">
          <div className="t-section text-slate-900 dark:text-white">Rebalance Simulator</div>
          <div className="t-meta">10-year projection</div>
        </div>
        <button
          onClick={reset}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          title="Reset to defaults"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Risk profile tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1">
        {['Conservative', 'Moderate', 'Aggressive'].map(p => (
          <button
            key={p}
            onClick={() => setProfile(p)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              profile === p
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Allocation total indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">Allocation total</span>
        <span className={`text-xs font-bold ${allocTotal === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
          {allocTotal}%
        </span>
      </div>

      {/* Sliders */}
      <div className="space-y-3 mb-4">
        {SLIDER_CONFIG.map(({ key, label, color }) => (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
              <span className="font-bold text-slate-900 dark:text-white">{alloc[key]}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={alloc[key]}
              onChange={e => update(key, e.target.value)}
              className="w-full"
              style={{
                background: `linear-gradient(to right, ${color} 0%, ${color} ${alloc[key]}%, rgba(148,163,184,0.2) ${alloc[key]}%, rgba(148,163,184,0.2) 100%)`,
                accentColor: color,
              }}
            />
          </div>
        ))}
      </div>

      {/* Health score preview */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] mb-4">
        <span className="text-xs text-slate-500">Projected Health Score</span>
        <motion.span
          key={scores.total}
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-xl font-extrabold"
          style={{ color: scoreColor }}
        >
          {scores.total}
        </motion.span>
      </div>

      {/* 10-year projection chart */}
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              {[
                { id: 'gc', color: '#6ee7b7' },
                { id: 'gm', color: '#818cf8' },
                { id: 'ga', color: '#fbbf24' },
              ].map(g => (
                <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={g.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={g.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="yr"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `Y${v}`}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${v / 1000}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="conservative" name="Conservative" stroke="#6ee7b7" strokeWidth={1.5} fill="url(#gc)" dot={false} />
            <Area type="monotone" dataKey="moderate"     name="Moderate"     stroke="#818cf8" strokeWidth={2}   fill="url(#gm)" dot={false} />
            <Area type="monotone" dataKey="aggressive"   name="Aggressive"   stroke="#fbbf24" strokeWidth={1.5} fill="url(#ga)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2">
        {[
          { label: 'Conservative', color: '#6ee7b7' },
          { label: 'Moderate',     color: '#818cf8' },
          { label: 'Aggressive',   color: '#fbbf24' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px] text-slate-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
