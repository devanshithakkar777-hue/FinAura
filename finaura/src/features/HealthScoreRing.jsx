import React from 'react';
import { motion } from 'framer-motion';

const SUB_RINGS = [
  { key: 'diversification', label: 'Diversif.',  color: '#6366f1', trackColor: 'rgba(99,102,241,0.12)',  r: 52, stroke: 8 },
  { key: 'volatility',      label: 'Volatility', color: '#10b981', trackColor: 'rgba(16,185,129,0.12)',  r: 40, stroke: 7 },
  { key: 'cryptoExposure',  label: 'Crypto',     color: '#f59e0b', trackColor: 'rgba(245,158,11,0.12)',  r: 29, stroke: 6 },
];

function scoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 65) return '#6366f1';
  if (score >= 45) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Poor';
}

function Ring({ r, stroke, color, trackColor, score, delay }) {
  const circ   = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(score, 100)) / 100;
  const cx = 68, cy = 68;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, delay, ease: [0.4, 0, 0.2, 1] }}
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
      />
    </g>
  );
}

export default function HealthScoreRing({ score = 0, subScores = {}, size = 136 }) {
  const mainColor = scoreColor(score);
  const label     = scoreLabel(score);

  return (
    <div className="flex flex-col items-center gap-4">
      <div style={{ width: size, height: size, position: 'relative' }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 136 136"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle cx={68} cy={68} r={62} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth={10} />
          <motion.circle
            cx={68} cy={68} r={62}
            fill="none"
            stroke={mainColor}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 62}
            initial={{ strokeDashoffset: 2 * Math.PI * 62 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 62 - (2 * Math.PI * 62 * Math.min(score, 100)) / 100 }}
            transition={{ duration: 1.5, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            className="glow-pulse"
          />
          {SUB_RINGS.map((ring, i) => (
            <Ring
              key={ring.key}
              r={ring.r}
              stroke={ring.stroke}
              color={ring.color}
              trackColor={ring.trackColor}
              score={subScores[ring.key] ?? 0}
              delay={0.3 + i * 0.15}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="text-3xl font-extrabold leading-none tracking-tight"
            style={{ color: mainColor }}
          >
            {score}
          </motion.span>
          <span className="text-[10px] font-semibold text-slate-400 mt-0.5 tracking-wide uppercase">{label}</span>
        </div>
      </div>
      <div className="flex gap-4">
        {SUB_RINGS.map(ring => (
          <div key={ring.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ring.color }} />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{ring.label}</span>
            <span className="text-[10px] font-bold" style={{ color: ring.color }}>
              {subScores[ring.key] ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
