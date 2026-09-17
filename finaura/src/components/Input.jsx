import React from 'react';

export function Input({ label, icon: Icon, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>}
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
        <input
          className={`w-full bg-slate-100 dark:bg-white/[0.04] border ${error ? 'border-red-500/50' : 'border-slate-200 dark:border-white/[0.08]'} rounded-xl ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 focus:bg-white dark:focus:bg-white/[0.06] transition-all ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>}
      <select
        className={`w-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500/60 transition-all appearance-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
