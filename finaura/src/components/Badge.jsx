import React from 'react';

const VARIANTS = {
  green:  'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400',
  red:    'bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400',
  amber:  'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  blue:   'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  purple: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  cyan:   'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  slate:  'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-400',
};

export function Badge({ variant = 'slate', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  );
}
