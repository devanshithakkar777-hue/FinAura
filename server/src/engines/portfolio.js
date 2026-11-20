import { diffDays, monthKey, addDays, parseDay, toDay } from '../lib/dates.js';
import { priceOn } from '../lib/series.js';

export class OversellError extends Error {
  constructor(symbol, day) { super(`Cannot sell more ${symbol} than you hold on ${day}`); this.symbol = symbol; this.day = day; }
}

export const sortTxns = txns =>
  [...txns].sort((a, b) => (a.executed_on < b.executed_on ? -1 : a.executed_on > b.executed_on ? 1 : (a.created_at ?? 0) < (b.created_at ?? 0) ? -1 : 1));

const EPS = 1e-6;

/** FIFO lot accounting. Throws OversellError if a sell exceeds holdings at that point in time. */
export function buildLedger(txns) {
  const lots = new Map();        // symbol -> [{qty, price, day}]
  let realised = 0;
  const realisedBySymbol = {};
  for (const t of sortTxns(txns)) {
    const q = Number(t.quantity), p = Number(t.price);
    if (t.side === 'buy') {
      if (!lots.has(t.symbol)) lots.set(t.symbol, []);
      lots.get(t.symbol).push({ qty: q, price: p, day: t.executed_on });
    } else {
      let remaining = q;
      const l = lots.get(t.symbol) ?? [];
      while (remaining > EPS && l.length) {
        const take = Math.min(remaining, l[0].qty);
        const pnl = take * (p - l[0].price);
        realised += pnl;
        realisedBySymbol[t.symbol] = (realisedBySymbol[t.symbol] ?? 0) + pnl;
        l[0].qty -= take; remaining -= take;
        if (l[0].qty <= EPS) l.shift();
      }
      if (remaining > 1e-4) throw new OversellError(t.symbol, t.executed_on);
    }
  }
  return { lots, realised, realisedBySymbol };
}

/**
 * Current positions from the ledger.
 * @param txns         user's transactions
 * @param assets       Map symbol -> {name, asset_class, volatility}
 * @param priceNow     Map symbol -> latest price (fallback: last trade price)
 */
export function computePositions(txns, assets, priceNow, today) {
  const { lots, realised, realisedBySymbol } = buildLedger(txns);
  const lastTrade = {};
  for (const t of sortTxns(txns)) lastTrade[t.symbol] = Number(t.price);
  const positions = [];
  for (const [symbol, l] of lots) {
    const quantity = l.reduce((s, x) => s + x.qty, 0);
    if (quantity <= EPS) continue;
    const costBasis = l.reduce((s, x) => s + x.qty * x.price, 0);
    const a = assets.get(symbol) ?? { name: symbol, asset_class: 'equity', volatility: 'Moderate' };
    const price = priceNow.get(symbol) ?? lastTrade[symbol];
    const value = quantity * price;
    positions.push({
      symbol, name: a.name, assetClass: a.asset_class, volatility: a.volatility,
      quantity, avgCost: costBasis / quantity, costBasis, price, value,
      unrealised: value - costBasis, unrealisedPct: costBasis ? (value - costBasis) / costBasis : 0,
      oldestLotDays: diffDays(today, l[0].day),
      realised: realisedBySymbol[symbol] ?? 0,
    });
  }
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  positions.forEach(p => { p.weight = totalValue ? p.value / totalValue : 0; });
  positions.sort((a, b) => b.value - a.value);

  const allocation = {};
  positions.forEach(p => { allocation[p.assetClass] = (allocation[p.assetClass] ?? 0) + p.value; });
  const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
  return {
    positions,
    allocation: Object.entries(allocation).map(([assetClass, value]) => ({ assetClass, value, weight: totalValue ? value / totalValue : 0 })).sort((a, b) => b.value - a.value),
    totals: { value: totalValue, costBasis: totalCost, unrealised: totalValue - totalCost, realised },
  };
}

/** Month-end portfolio value and cumulative net contribution, for charts. */
export function valueHistory(txns, seriesBySymbol, today, maxPoints = 60) {
  const sorted = sortTxns(txns);
  if (!sorted.length) return [];
  const start = sorted[0].executed_on;
  const days = [];
  let cursor = parseDay(start);
  const end = parseDay(today);
  // month-end points
  while (cursor <= end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const d = toDay(next <= end ? next : end);
    if (!days.length || days[days.length - 1] !== d) days.push(d);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  const pts = days.map(day => {
    const upTo = sorted.filter(t => t.executed_on <= day);
    const qty = {};
    let contributed = 0;
    for (const t of upTo) {
      const q = Number(t.quantity);
      qty[t.symbol] = (qty[t.symbol] ?? 0) + (t.side === 'buy' ? q : -q);
      contributed += (t.side === 'buy' ? 1 : -1) * q * Number(t.price);
    }
    let value = 0;
    for (const [sym, q] of Object.entries(qty)) {
      if (q <= EPS) continue;
      const p = priceOn(seriesBySymbol.get(sym) ?? [], day);
      if (p) value += q * p;
    }
    return { day, value: Math.round(value * 100) / 100, contributed: Math.round(contributed * 100) / 100 };
  });
  return pts.length > maxPoints ? pts.slice(-maxPoints) : pts;
}

export { monthKey, addDays };
