import { mulberry32 } from '../engines/twin.js';
import { addDays, diffDays, toDay } from '../lib/dates.js';
import { priceOn } from '../lib/series.js';

const START = '2025-01-01';

export const DEMO_ASSETS = [
  { symbol: 'DEMO_INDEX', name: 'Demo Index Fund (synthetic)',   asset_class: 'equity',     volatility: 'Moderate', start: 240,  mu: 0.00035, sigma: 0.009, seed: 11,
    shocks: [{ from: '2025-10-08', len: 10, total: -0.12 }, { from: '2025-10-18', len: 60, total: 0.16 }, { from: '2026-04-06', len: 8, total: -0.09 }, { from: '2026-04-14', len: 45, total: 0.12 }] },
  { symbol: 'DEMO_BTC',   name: 'Demo Crypto (synthetic)',       asset_class: 'crypto',     volatility: 'High',     start: 3000, mu: 0.0001,  sigma: 0.026, seed: 23,
    shocks: [{ from: '2025-09-01', len: 30, total: 0.45 }, { from: '2025-10-08', len: 7, total: -0.30 }, { from: '2025-10-16', len: 45, total: 0.5 },
             { from: '2026-03-01', len: 30, total: 0.38 }, { from: '2026-04-06', len: 7, total: -0.26 }, { from: '2026-04-14', len: 50, total: 0.4 }] },
  { symbol: 'DEMO_FUND',  name: 'Demo Flexi-cap Fund (synthetic)', asset_class: 'mutualFund', volatility: 'Moderate', start: 60,  mu: 0.0004,  sigma: 0.0075, seed: 37, shocks: [{ from: '2025-10-08', len: 10, total: -0.10 }, { from: '2025-10-18', len: 60, total: 0.14 }] },
  { symbol: 'DEMO_GOLD',  name: 'Demo Gold ETF (synthetic)',     asset_class: 'gold',       volatility: 'Moderate', start: 55,   mu: 0.0003,  sigma: 0.007,  seed: 41, shocks: [] },
  { symbol: 'DEMO_BOND',  name: 'Demo Govt Bond Fund (synthetic)', asset_class: 'bond',     volatility: 'Low',      start: 1000, mu: 0.0002,  sigma: 0.0015, seed: 53, shocks: [] },
];

function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic synthetic series from START to `today`. Extending later days never changes earlier ones. */
export function genSeries(asset, today) {
  const rand = mulberry32(asset.seed);
  const n = diffDays(today, START);
  let p = asset.start;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const day = addDays(START, i);
    let shock = 0;
    for (const s of asset.shocks) {
      const off = diffDays(day, s.from);
      if (off >= 0 && off < s.len) shock += Math.log(1 + s.total) / s.len;
    }
    p *= Math.exp(asset.mu + asset.sigma * gauss(rand) + shock);
    out.push({ day, close: Math.round(p * 10000) / 10000 });
  }
  return out;
}

export async function ensureDemoMarket(db, today) {
  for (const a of DEMO_ASSETS) {
    await db.query(
      `INSERT INTO assets (symbol, name, asset_class, volatility, verified) VALUES ($1,$2,$3,$4,true) ON CONFLICT (symbol) DO NOTHING`,
      [a.symbol, a.name, a.asset_class, a.volatility]);
    const series = genSeries(a, today);
    const days = series.map(s => s.day), closes = series.map(s => s.close);
    await db.query(
      `INSERT INTO price_history (symbol, day, close, source)
         SELECT $1, d, c, 'demo' FROM unnest($2::date[], $3::numeric[]) AS t(d, c)
       ON CONFLICT (symbol, day) DO NOTHING`, [a.symbol, days, closes]);
  }
}

function monthly(startDay, today) {
  const out = [];
  let d = startDay;
  while (d <= today) {
    out.push(d);
    const dt = new Date(`${d}T00:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + 1);
    d = toDay(dt);
  }
  return out;
}

/** Build a believable but synthetic trading history for the demo user (includes a few classic mistakes). */
export function demoTransactions(today) {
  const series = Object.fromEntries(DEMO_ASSETS.map(a => [a.symbol, genSeries(a, today)]));
  const px = (sym, day) => priceOn(series[sym], day);
  const txns = [];
  const buy = (sym, day, amount, note) => { if (day <= today) txns.push({ symbol: sym, side: 'buy', day, price: px(sym, day), quantity: amount / px(sym, day), note }); };
  const sellFrac = (sym, day, frac, note) => {
    if (day > today) return;
    const held = txns.filter(t => t.symbol === sym && t.day <= day).reduce((s, t) => s + (t.side === 'buy' ? t.quantity : -t.quantity), 0);
    if (held > 0) txns.push({ symbol: sym, side: 'sell', day, price: px(sym, day), quantity: held * frac, note });
  };
  monthly('2025-04-05', today).forEach(d => buy('DEMO_INDEX', d, 10000, 'Monthly SIP'));
  monthly('2025-05-07', today).forEach(d => buy('DEMO_FUND', d, 5000, 'Monthly SIP'));
  buy('DEMO_BOND', '2025-06-10', 40000, 'Safety allocation');
  buy('DEMO_GOLD', '2025-07-15', 25000, 'Hedge');
  buy('DEMO_BTC', '2025-07-05', 30000, 'First crypto buy');
  buy('DEMO_BTC', '2025-09-26', 40000, 'It keeps going up!');
  sellFrac('DEMO_BTC', '2025-10-13', 0.7, 'Too scary, getting out');
  buy('DEMO_BTC', '2026-03-26', 30000, 'Not missing this one');
  sellFrac('DEMO_BTC', '2026-04-12', 0.5, 'Selling before it gets worse');
  return txns.sort((a, b) => (a.day < b.day ? -1 : 1));
}

export async function loadDemoPortfolio(db, userId, today) {
  await ensureDemoMarket(db, today);
  const txns = demoTransactions(today);
  for (const t of txns) {
    await db.query(
      `INSERT INTO transactions (user_id, symbol, side, quantity, price, executed_on, note, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'demo')`,
      [userId, t.symbol, t.side, Math.round(t.quantity * 1e6) / 1e6, t.price, t.day, t.note]);
  }
  return txns.length;
}
