import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, AlertTriangle, CheckCircle2, Info, Inbox } from 'lucide-react'
import { spotlight, useToasts, useCountUp } from '../lib/hooks.jsx'

export const cx = (...a) => a.filter(Boolean).join(' ')

export function Glass({ className, children, lift, flat, as: Tag = 'div', ...rest }) {
  return <Tag onPointerMove={flat ? undefined : spotlight} className={cx('glass', lift && 'lift', flat && 'flat', className)} {...rest}>{children}</Tag>
}

export function Button({ variant = 'ghost', size, loading, className, children, ...p }) {
  return (
    <button className={cx('btn', `btn-${variant}`, size && `btn-${size}`, className)} disabled={loading || p.disabled} {...p}>
      {loading && <span className="spinner" aria-hidden />}{children}
    </button>
  )
}

export function Field({ label, hint, error, className, children, ...p }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted">{label}</span>}
      {children ?? <input className="field" {...p} />}
      {error ? <span className="mt-1 block text-xs text-rose">{error}</span> : hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  )
}

export function Chip({ tone, children, className }) {
  const c = { good: 'var(--good)', warn: 'var(--amber)', bad: 'var(--rose)', info: 'var(--a1)' }[tone]
  return (
    <span className={cx('chip', className)} style={c ? { color: c, borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` } : undefined}>
      {children}
    </span>
  )
}

export function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: [.2, .8, .2, 1] }}
      className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="t-eyebrow mb-2">{eyebrow}</div>}
        <h1 className="t-display text-[28px] font-bold leading-tight sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </motion.header>
  )
}

export function Stat({ label, value, sub, tone, icon: Icon, format = v => Math.round(v).toLocaleString(), animate = true }) {
  const n = useCountUp(typeof value === 'number' ? value : NaN, { enabled: animate && typeof value === 'number' })
  const color = { good: 'var(--good)', bad: 'var(--rose)', warn: 'var(--amber)' }[tone]
  return (
    <Glass lift className="p-5">
      <div className="flex items-center justify-between">
        <span className="t-eyebrow">{label}</span>
        {Icon && <Icon size={16} className="text-faint" />}
      </div>
      <div className="t-display t-num mt-3 text-[26px] font-bold leading-none sm:text-[30px]" style={color ? { color } : undefined}>
        {typeof value === 'number' ? format(n) : value}
      </div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </Glass>
  )
}

export function Skeletons({ rows = 3, h = 120 }) {
  return <div className="grid gap-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>
}

export function ErrorState({ message, onRetry }) {
  return (
    <Glass flat className="flex flex-col items-center gap-3 p-10 text-center">
      <AlertTriangle className="text-amber" />
      <p className="max-w-sm text-sm text-muted">{message || 'Something went wrong.'}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </Glass>
  )
}

export function Empty({ title, body, action, icon: Icon = Inbox }) {
  return (
    <Glass flat className="flex flex-col items-center gap-3 p-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'var(--glass-a)' }}><Icon size={22} className="text-a1" /></div>
      <h3 className="t-display text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </Glass>
  )
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined
    const k = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cx('glass glass-solid flat relative max-h-[90vh] w-full overflow-auto p-6', wide ? 'max-w-2xl' : 'max-w-md')}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="t-display text-xl font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:text-ink"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Toasts() {
  const { items, dismiss } = useToasts()
  const icon = { success: <CheckCircle2 size={16} className="text-good" />, error: <AlertTriangle size={16} className="text-rose" />, info: <Info size={16} className="text-a1" /> }
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-6" aria-live="polite">
      <AnimatePresence>
        {items.map(t => (
          <motion.div key={t.id} layout initial={{ opacity: 0, x: 40, scale: .95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
            className="glass glass-solid flat pointer-events-auto flex items-start gap-3 p-3.5 text-sm">
            <span className="mt-0.5">{icon[t.kind] ?? icon.info}</span>
            <div className="flex-1">
              {t.title && <div className="font-semibold">{t.title}</div>}
              <div className={t.title ? 'text-muted' : ''}>{t.text}</div>
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-faint hover:text-ink"><X size={14} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('inline-flex rounded-2xl border p-1', className)} style={{ borderColor: 'var(--stroke)', background: 'var(--glass-b)' }} role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className="relative rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
          style={{ color: value === o.value ? 'var(--ink)' : 'var(--muted)' }}>
          {value === o.value && <motion.span layoutId={`seg-${options.map(x => x.value).join()}`} className="absolute inset-0 rounded-xl" style={{ background: 'var(--glass-a)', border: '1px solid var(--stroke-strong)' }} transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export const stagger = { hidden: {}, show: { transition: { staggerChildren: .06 } } }
export const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: .5, ease: [.2, .8, .2, 1] } } }

export function Disclaimer({ children }) {
  return <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">{children}</p>
}
