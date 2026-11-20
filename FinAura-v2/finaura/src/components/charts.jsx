import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CLASS_COLOR } from '../lib/format.js'

/** Measured width of an element, so charts render 1:1 instead of letterboxing. */
function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
/** Catmull-Rom → cubic Bézier for a smooth curve */
function smooth(pts) {
  if (pts.length < 3) return path(pts)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Area/line chart. series: [{ key, color, values:number[], dashed?, area? }] sharing labels[] */
export function LineArea({ labels, series, height = 240, fmt = v => v, labelFmt = l => l, yPad = .08 }) {
  const id = useId().replace(/:/g, '')
  const ref = useRef(null)
  const [wrap, W] = useWidth()
  const [hover, setHover] = useState(null)
  const H = height, P = { l: 8, r: 8, t: 14, b: 22 }
  const { lo, hi } = useMemo(() => {
    const all = series.flatMap(s => s.values).filter(Number.isFinite)
    const mn = Math.min(...all), mx = Math.max(...all), pad = (mx - mn || 1) * yPad
    return { lo: mn - pad, hi: mx + pad }
  }, [series, yPad])
  const n = labels.length
  const x = i => P.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - P.l - P.r))
  const y = v => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b)
  const onMove = e => {
    const r = ref.current.getBoundingClientRect()
    const rel = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - P.l) / (W - P.l - P.r)) * (n - 1)))))
  }
  const ticks = [0, .5, 1].map(t => lo + (hi - lo) * t)
  const labelIdx = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0]
  return (
    <div className="relative w-full min-w-0" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block touch-none select-none"
 onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img">
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity=".38" /><stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => <line key={i} x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--stroke)" strokeDasharray="3 6" />)}
        {series.map(s => {
          const pts = s.values.map((v, i) => [x(i), y(v)])
          const d = smooth(pts)
          return (
            <g key={s.key}>
              {s.area !== false && <path d={`${d} L${x(n - 1)},${H - P.b} L${x(0)},${H - P.b} Z`} fill={`url(#${id}-${s.key})`} />}
              <motion.path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeDasharray={s.dashed ? '5 6' : undefined}
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.1, ease: [.2, .8, .2, 1] }}
                style={{ filter: `drop-shadow(0 0 6px ${s.color})` }} />
            </g>
          )
        })}
        {labelIdx.map(i => <text key={i} x={x(i)} y={H - 5} fontSize="10" fill="var(--faint)" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{labelFmt(labels[i])}</text>)}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--stroke-strong)" />
            {series.map(s => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill="var(--bg)" stroke={s.color} strokeWidth="2.5" />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="glass glass-solid flat pointer-events-none absolute top-1 z-10 px-3 py-2 text-xs"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 60px), calc(100% - 140px))`, borderRadius: 12 }}>
          <div className="mb-1 font-semibold text-muted">{labelFmt(labels[hover])}</div>
          {series.map(s => <div key={s.key} className="flex items-center gap-2 t-num"><i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name ?? s.key}: <b>{fmt(s.values[hover])}</b></div>)}
        </div>
      )}
    </div>
  )
}

/** Monte-Carlo fan: two scenarios each with p10–p90 band + median. */
export function FanChart({ a, b, height = 300, fmt = v => v, aName = 'Disciplined', bName = 'Your habits', aColor = 'var(--a3)', bColor = 'var(--rose)' }) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState(null)
  const ref = useRef(null)
  const [wrap, W] = useWidth()
  const H = height, P = { l: 8, r: 8, t: 14, b: 22 }
  const n = a.length
  const lo = Math.min(...a.map(p => p.p10), ...b.map(p => p.p10)) * .96
  const hi = Math.max(...a.map(p => p.p90), ...b.map(p => p.p90)) * 1.03
  const x = i => P.l + (i / (n - 1)) * (W - P.l - P.r)
  const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const band = (s) => `${smooth(s.map((p, i) => [x(i), y(p.p90)]))} L${[...s].reverse().map((p, i) => `${x(n - 1 - i)},${y(p.p10)}`).join(' L')} Z`
  const med = s => smooth(s.map((p, i) => [x(i), y(p.p50)]))
  const onMove = e => {
    const r = ref.current.getBoundingClientRect()
    const rel = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - P.l) / (W - P.l - P.r)) * (n - 1)))))
  }
  return (
    <div className="relative w-full min-w-0" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block touch-none"
 onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Projected wealth ranges">
        <defs>
          <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={aColor} stopOpacity=".28" /><stop offset="1" stopColor={aColor} stopOpacity=".04" /></linearGradient>
          <linearGradient id={`${id}b`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={bColor} stopOpacity=".26" /><stop offset="1" stopColor={bColor} stopOpacity=".04" /></linearGradient>
        </defs>
        {[0, .33, .66, 1].map((t, i) => <line key={i} x1={P.l} x2={W - P.r} y1={y(lo + (hi - lo) * t)} y2={y(lo + (hi - lo) * t)} stroke="var(--stroke)" strokeDasharray="3 6" />)}
        <motion.path d={band(a)} fill={`url(#${id}a)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .9 }} />
        <motion.path d={band(b)} fill={`url(#${id}b)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .9, delay: .15 }} />
        <motion.path d={med(a)} fill="none" stroke={aColor} strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3 }} style={{ filter: `drop-shadow(0 0 7px ${aColor})` }} />
        <motion.path d={med(b)} fill="none" stroke={bColor} strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, delay: .15 }} style={{ filter: `drop-shadow(0 0 7px ${bColor})` }} />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--stroke-strong)" />}
        <text x={P.l} y={H - 5} fontSize="10" fill="var(--faint)">Now</text>
        <text x={W - P.r} y={H - 5} fontSize="10" fill="var(--faint)" textAnchor="end">+{Math.round(a[n - 1].month / 12)}y</text>
      </svg>
      {hover != null && (
        <div className="glass glass-solid flat pointer-events-none absolute top-1 z-10 px-3 py-2 text-xs" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 70px), calc(100% - 170px))`, borderRadius: 12 }}>
          <div className="mb-1 font-semibold text-muted">Year {(a[hover].month / 12).toFixed(1)}</div>
          <div className="t-num"><i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: aColor }} />{aName}: <b>{fmt(a[hover].p50)}</b></div>
          <div className="t-num"><i className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: bColor }} />{bName}: <b>{fmt(b[hover].p50)}</b></div>
          <div className="mt-1 text-faint">Shaded = 10th–90th percentile</div>
        </div>
      )}
    </div>
  )
}

/** Circular score gauge with glow. */
export function Ring({ value, size = 150, stroke = 11, label, sub, colors = ['var(--a1)', 'var(--a3)'] }) {
  const id = useId().replace(/:/g, '')
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--stroke)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ duration: 1.4, ease: [.2, .8, .2, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${colors[1]})` }} />
      </svg>
      <div className="absolute text-center">
        <div className="t-display t-num font-bold leading-none" style={{ fontSize: size * .3 }}>{Math.round(v)}</div>
        {label && <div className="t-eyebrow mt-1.5" style={{ fontSize: 10 }}>{label}</div>}
        {sub}
      </div>
    </div>
  )
}

export function Bar({ value, color = 'var(--a1)', height = 6 }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: 'var(--stroke)' }}>
      <motion.div className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={{ duration: 1, ease: [.2, .8, .2, 1] }} />
    </div>
  )
}

export function Donut({ items, size = 170, center }) {
  const r = size / 2 - 14, c = 2 * Math.PI * r
  const offsets = items.reduce((o, it) => [...o, o[o.length - 1] + Math.max(0, it.weight) * c], [0])
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--stroke)" strokeWidth="14" />
        {items.map((it, i) => {
          const len = Math.max(0, it.weight) * c, off = offsets[i]
          return <motion.circle key={it.assetClass} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CLASS_COLOR[it.assetClass] ?? '#999'} strokeWidth="14"
            strokeDasharray={`${Math.max(0, len - 3)} ${c}`} strokeDashoffset={-off} strokeLinecap="round"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .08 }} />
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  )
}

export function Spark({ values, color = 'var(--a3)', width = 90, height = 30 }) {
  if (!values?.length) return null
  const mn = Math.min(...values), mx = Math.max(...values)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * width, height - 3 - ((v - mn) / (mx - mn || 1)) * (height - 6)])
  return <svg width={width} height={height}><path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
}
