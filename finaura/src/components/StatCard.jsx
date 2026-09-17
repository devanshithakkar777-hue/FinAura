import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function StatCard({ label, value, change, changeLabel, icon: Icon, iconColor = 'text-indigo-400', iconBg = 'bg-indigo-500/10', delay = 0 }) {
  const isUp      = change > 0;
  const isNeutral = change === 0 || change === undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] }}
      className="bg-white dark:bg-[#161b27] border border-slate-200 dark:border-white/[0.07] rounded-2xl p-5 hover:border-slate-300 dark:hover:border-white/[0.12] hover:shadow-lg dark:hover:shadow-black/30 transition-all duration-200 cursor-default"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon size={14} className={iconColor} />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1.5">{value}</div>
      {changeLabel && (
        <div className={`flex items-center gap-1 text-xs font-medium ${isNeutral ? 'text-slate-400' : isUp ? 'text-emerald-500' : 'text-red-400'}`}>
          {!isNeutral && (isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
          {changeLabel}
        </div>
      )}
    </motion.div>
  );
}
