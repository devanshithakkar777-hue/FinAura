import React from 'react';
import { motion } from 'framer-motion';

const VARIANTS = {
  primary: 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-sm shadow-indigo-500/20',
  ghost:   'bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.09] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]',
  danger:  'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({ variant = 'ghost', size = 'md', children, className = '', disabled, ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function IconButton({ children, className = '', ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      className={`w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.09] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 transition-all ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
