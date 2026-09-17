import React from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const DEFAULT_DATA = [
  { name: 'Equities',     value: 45, color: '#818cf8' },
  { name: 'Crypto',       value: 25, color: '#fbbf24' },
  { name: 'Mutual Funds', value: 18, color: '#6ee7b7' },
  { name: 'Bonds',        value: 12, color: '#67e8f9' },
];

const RADIAN = Math.PI / 180;

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
  if (value < 12) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="rgba(15,23,42,0.75)" textAnchor="middle"
      dominantBaseline="central" fontSize={11} fontWeight={700}>
      {value}%
    </text>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2 shadow-lg text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
        <span className="font-semibold text-slate-900 dark:text-white">{d.name}</span>
        <span className="text-slate-400 ml-1">{d.value}%</span>
      </div>
    </div>
  );
};

export default function PortfolioAllocation({ data = DEFAULT_DATA }) {
  return (
    <div className="space-y-4">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={44} outerRadius={68}
              dataKey="value"
              labelLine={false}
              label={PieLabel}
              paddingAngle={2}
            >
              {data.map((e, i) => (
                <Cell key={i} fill={e.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2.5">
        {data.map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.07 }}
            className="flex items-center gap-2.5"
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{a.name}</span>
            <div className="w-20 h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${a.value}%` }}
                transition={{ duration: 0.9, delay: 0.3 + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
                className="h-full rounded-full"
                style={{ background: a.color }}
              />
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 w-8 text-right">{a.value}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
