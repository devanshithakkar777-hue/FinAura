import { addDays, diffDays } from './dates.js';

/** A series is an ascending array of { day: 'YYYY-MM-DD', close: number }. */

export function normalizeSeries(rows) {
  return [...rows]
    .map(r => ({ day: String(r.day).slice(0, 10), close: Number(r.close) }))
    .filter(r => Number.isFinite(r.close) && r.close > 0)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Price on a day: last close on or before it (carry-forward); before the first point → first close. */
export function priceOn(series, day) {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].day <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans === -1 ? series[0].close : series[ans].close;
}

export const latest = series => (series.length ? series[series.length - 1] : null);

/** Return from `daysBack` days before `day` to `day`. */
export function trailingReturn(series, day, daysBack) {
  const a = priceOn(series, addDays(day, -daysBack));
  const b = priceOn(series, day);
  return a && b ? b / a - 1 : null;
}

export function forwardReturn(series, day, daysAhead, today) {
  if (diffDays(today, day) < daysAhead) return null;
  const a = priceOn(series, day);
  const b = priceOn(series, addDays(day, daysAhead));
  return a && b ? b / a - 1 : null;
}

/** Wilder RSI over daily closes (default 14). Returns null with too little data. */
export function rsi(series, period = 14) {
  const closes = series.map(s => s.close);
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/**
 * Use real price history when there is enough; otherwise build an approximate series
 * from the user's own trade prices (carry-forward). Returns { series, quality }.
 */
export function seriesFor(priceRows, symbolTxns) {
  const real = normalizeSeries(priceRows);
  if (real.length >= 20) return { series: real, quality: 'market' };
  const fromTrades = normalizeSeries(symbolTxns.map(t => ({ day: t.executed_on, close: t.price })));
  const merged = normalizeSeries([...real, ...fromTrades]);
  return { series: merged, quality: 'approx' };
}

export const median = arr => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
