import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Search } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const CATS = ['All', 'Stocks', 'Crypto', 'Mutual Funds', 'ETFs'];

const INDICES = [
  { name: 'S&P 500',      value: '5,234.18',   change: '+0.87%', up: true  },
  { name: 'NASDAQ',       value: '16,428.82',  change: '+1.14%', up: true  },
  { name: 'NIFTY 50',     value: '22,147.00',  change: '-0.43%', up: false },
  { name: 'BTC Dom.',     value: '52.4%',      change: '+0.3%',  up: true  },
  { name: 'Fear & Greed', value: '72 / Greed', change: '+4',     up: true  },
];

const MARKETS = [
  { name: 'Apple Inc.',            ticker: 'AAPL',  cat: 'Stocks',       price: '$189.30', change: '+0.84%', up: true,  cap: '$2.94T',    icon: '🍎', spark: [182,184,181,186,188,187,189] },
  { name: 'NVIDIA Corp.',          ticker: 'NVDA',  cat: 'Stocks',       price: '$875.40', change: '+2.31%', up: true,  cap: '$2.16T',    icon: '🟢', spark: [820,835,828,850,860,868,875] },
  { name: 'Bitcoin',               ticker: 'BTC',   cat: 'Crypto',       price: '$67,420', change: '+3.81%', up: true,  cap: '$1.32T',    icon: '₿',  spark: [62000,63500,61800,64200,65800,66400,67420] },
  { name: 'Ethereum',              ticker: 'ETH',   cat: 'Crypto',       price: '$3,540',  change: '+2.14%', up: true,  cap: '$425B',     icon: '⟠', spark: [3200,3280,3190,3350,3420,3490,3540] },
  { name: 'Solana',                ticker: 'SOL',   cat: 'Crypto',       price: '$182.60', change: '-1.23%', up: false, cap: '$82B',      icon: '◎', spark: [192,188,190,185,183,184,182] },
  { name: 'S&P 500 ETF',           ticker: 'SPY',   cat: 'ETFs',         price: '$478.32', change: '+1.24%', up: true,  cap: '$520B',     icon: '📊', spark: [465,468,464,470,473,476,478] },
  { name: 'Mirae Asset Large Cap', ticker: 'MALCF', cat: 'Mutual Funds', price: '₹54.70',  change: '+0.62%', up: true,  cap: '₹38,200Cr', icon: '🏦', spark: [52,52.5,52.2,53,53.5,54.1,54.7] },
  { name: 'Tesla Inc.',            ticker: 'TSLA',  cat: 'Stocks',       price: '$248.50', change: '-0.91%', up: false, cap: '$790B',     icon: '⚡', spark: [255,252,254,250,249,250,248] },
];

const TYPE_BADGE = { Crypto: 'amber', Stocks: 'purple', ETFs: 'cyan', 'Mutual Funds': 'green' };

function Sparkline({ data, up }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 56;
    const y = 18 - ((v - min) / (max - min || 1)) * 16;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="56" height="18" className="block">
      <polyline points={pts} fill="none"
        stroke={up ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Markets() {
  const [cat, setCat]     = useState('All');
  const [query, setQuery] = useState('');

  const filtered = MARKETS.filter(m =>
    (cat === 'All' || m.cat === cat) &&
    (m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.ticker.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="space-y-4 page-enter">
      {/* Index strip */}
      <Card animate delay={0} className="p-4">
        <div className="flex gap-8 overflow-x-auto pb-1">
          {INDICES.map((idx, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="shrink-0"
            >
              <div className="text-[11px] text-slate-400 mb-1">{idx.name}</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{idx.value}</div>
              <div className={`text-xs font-medium ${idx.up ? 'text-emerald-500' : 'text-red-400'}`}>{idx.change}</div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* Table */}
      <Card animate delay={0.05} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg p-1 flex-wrap">
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  cat === c
                    ? 'bg-white dark:bg-[#1e2535] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl pl-8 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/50 transition-colors w-44"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.06]">
                {['Asset', 'Category', 'Price', '7D Chart', 'Change', 'Market Cap', ''].map((h, i) => (
                  <th key={i} className={`pb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <motion.tr key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-lg shrink-0">
                        {m.icon}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                        <div className="text-[11px] text-slate-400">{m.ticker}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 text-right"><Badge variant={TYPE_BADGE[m.cat]}>{m.cat}</Badge></td>
                  <td className="py-3.5 text-right font-semibold text-slate-900 dark:text-white">{m.price}</td>
                  <td className="py-3.5 text-right"><div className="flex justify-end"><Sparkline data={m.spark} up={m.up} /></div></td>
                  <td className="py-3.5 text-right">
                    <Badge variant={m.up ? 'green' : 'red'}>
                      {m.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {m.change}
                    </Badge>
                  </td>
                  <td className="py-3.5 text-right text-slate-400 text-xs">{m.cap}</td>
                  <td className="py-3.5 text-right"><Button size="sm">Trade</Button></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
