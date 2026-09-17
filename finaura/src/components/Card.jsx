import React from 'react';
import { motion } from 'framer-motion';

export function Card({ children, className = '', hover = true, animate = false, delay = 0, glass = true, ...props }) {
  const base = [
    glass
      ? 'bg-white/80 dark:bg-slate-800/60 backdrop-blur-md'
      : 'bg-white dark:bg-slate-800',
    'border border-slate-200 dark:border-white/[0.07]',
    'rounded-2xl',
    'shadow-sm',
    hover ? 'hover:shadow-lg hover:-translate-y-0.5' : '',
    'transition-all duration-200',
    className,
  ].filter(Boolean).join(' ');

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay, ease: [0.4, 0, 0.2, 1] }}
        className={base}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
  return <div className={base} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between mb-5 ${className}`}>
      <div>
        <h3 className="t-section text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="t-meta mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}
