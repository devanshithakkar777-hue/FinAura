import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Plus, TrendingUp, Download } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const ALLOC = [
  { name: 'Equities',     value: 45, color: '#6366f1' },
  { name: 'Crypto',       value: 25, color: '#f59e0b' },
  { name: 'Mutual Funds', value: 18, color: '#22c55e' },
  { name: 'Bonds',        value: 12, color: '#06b6d4' },
];

const HOLDINGS = [
  { name: 'S&P 500 ETF',           ticker: 'SPY',   type: 'Equity',      qty: 94,   avgCost: 421.5,  current: 478.32, icon: '📈', color: '#6366f1' },
  { name: 'Bitcoin',               ticker: 'BTC',   type: 'Crypto',      qty: 0.37, avgCost: 52000,  current: 67420,  icon: '₿',  color: '#f59e0b' },
  { name: 'Mirae Asset Large Cap', ticker: 'MALCF', type: 'Mutual Fund', qty: 312,  avgCost: 48.2,   current: 54.7,   icon: '🏦', color: '#22c55e' },
  { name: 'Ethereum',              ticker: 'ETH',   type: 'Crypto',      qty: 2.1,  avgCost: 2800,   current: 3540,   icon: '⟠', color: '#818cf8' },
  { name: 'US Treasury 10Y',       ticker: 'TLT',   type: 'Bond',        qty: 145,  avgCost: 101.2,  current: 97.8,   icon: '🏛️', color: '#06b6d4' },
];

const PERF = [
  { m: 'Jul', v: 98700  }, { m: 'Aug', v: 103200 }, { m: 'Sep', v: 99800  },
  { m: 'Oct', v: 108500 }, { m: 'Nov', v: 112300 }, { m: 'Dec', v: 118640 },
];

const TYPE_BADGE = { Crypto: 'amber', Equity: 'purple', 'Mutual Fund': 'green', Bond: 'cyan' };

const RADIAN = Math.PI / 180;
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
  if (value < 10) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle"
      dominantBaseline="central" fontSize={11} fontWeight={700}>
      {value}%
    </text>
  );
};

export default function Portfolio() {
  const [tab, setTab] = useState('holdings');

  return (
    <div className="space-y-4 page-enter">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation */}
        <Card animate delay={0} className="p-5">
          <CardHeader
            title="Allocation"
            subtitle="By asset class"
            action={<Button size="sm" variant="primary"><Plus size={12} /> Add Asset</Button>}
          />
          <div className="flex items-center gap-6">
            <div className="w-40 h-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ALLOC} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                    dataKey="value" labelLine={false} label={PieLabel}>
                    {ALLOC.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                    formatter={v => [`${v}%`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2.5">
              {ALLOC.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: a.color }} />
                  <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{a.name}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{a.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 6M Performance */}
        <Card animate delay={0.05} className="p-5">
          <CardHeader
            title="6-Month Performance"
            subtitle="+$19,940 · +20.2%"
            action={<Badge variant="green"><ArrowUpRight size={10} /> Outperforming</Badge>}
          />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PERF} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                  formatter={v => [`$${v.toLocaleString()}`, 'Value']}
                />
                <Area type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={2.5} fill="url(#perfGrad)"
                  dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card animate delay={0.1} className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg p-1">
            {['holdings', 'transactions'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                  tab === t
                    ? 'bg-white dark:bg-[#1e2535] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <Button size="sm"><Download size={12} /> Export</Button>
        </div>

        {tab === 'holdings' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                  {['Asset', 'Type', 'Qty', 'Avg Cost', 'Current', 'P&L', 'Return'].map((h, i) => (
                    <th key={h} className={`pb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOLDINGS.map((h, i) => {
                  const pnl = (h.current - h.avgCost) * h.qty;
                  const ret = ((h.current - h.avgCost) / h.avgCost) * 100;
                  const up  = pnl >= 0;
                  return (
                    <motion.tr key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.04 }}
                      className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
                            style={{ background: `${h.color}18` }}>{h.icon}</div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm">{h.name}</div>
                            <div className="text-[11px] text-slate-400">{h.ticker}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-right"><Badge variant={TYPE_BADGE[h.type]}>{h.type}</Badge></td>
                      <td className="py-3.5 text-right font-medium text-slate-700 dark:text-slate-300">{h.qty}</td>
                      <td className="py-3.5 text-right text-slate-400">${h.avgCost.toLocaleString()}</td>
                      <td className="py-3.5 text-right font-semibold text-slate-900 dark:text-white">${h.current.toLocaleString()}</td>
                      <td className={`py-3.5 text-right font-semibold ${up ? 'text-emerald-500' : 'text-red-400'}`}>
                        {up ? '+' : ''}{pnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3.5 text-right">
                        <Badge variant={up ? 'green' : 'red'}>
                          {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          {Math.abs(ret).toFixed(1)}%
                        </Badge>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <TrendingUp size={28} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400">Transaction history coming soon</p>
          </div>
        )}
      </Card>
    </div>
  );
}
