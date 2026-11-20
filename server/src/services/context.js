import { seriesFor, latest, normalizeSeries } from '../lib/series.js';
import { computePositions, valueHistory } from '../engines/portfolio.js';
import { computeHealth, rsiMap } from '../engines/health.js';

/** Load everything the engines need for one user in 3 queries. */
export async function loadPortfolioContext(db, user, today) {
  const { rows: txns } = await db.query(
    `SELECT id, symbol, side, quantity, price, executed_on, note, source, created_at
       FROM transactions WHERE user_id = $1 ORDER BY executed_on, created_at`, [user.id]);
  const symbols = [...new Set(txns.map(t => t.symbol))];
  const assets = new Map();
  const priceRows = {};
  if (symbols.length) {
    const a = await db.query('SELECT symbol, name, asset_class, volatility FROM assets WHERE symbol = ANY($1)', [symbols]);
    a.rows.forEach(r => assets.set(r.symbol, r));
    const p = await db.query('SELECT symbol, day, close FROM price_history WHERE symbol = ANY($1) ORDER BY day', [symbols]);
    p.rows.forEach(r => (priceRows[r.symbol] ??= []).push(r));
  }
  const seriesBySymbol = new Map();
  const quality = {};
  for (const s of symbols) {
    const { series, quality: q } = seriesFor(priceRows[s] ?? [], txns.filter(t => t.symbol === s));
    seriesBySymbol.set(s, series);
    quality[s] = q;
  }
  const priceNow = new Map([...seriesBySymbol].map(([s, ser]) => [s, latest(ser)?.close]).filter(([, v]) => v));
  const portfolio = computePositions(txns, assets, priceNow, today);
  const rsi = rsiMap(new Map([...seriesBySymbol].filter(([s]) => quality[s] === 'market')));
  const riskProfile = user.risk_profile ?? 'Moderate';
  const health = computeHealth(portfolio.positions, riskProfile, rsi);
  const dataQuality = symbols.length && symbols.every(s => quality[s] === 'market') ? 'market' : symbols.length ? 'approx' : 'none';
  const cryptoWeight = portfolio.allocation.find(a => a.assetClass === 'crypto')?.weight ?? 0;
  return { txns, assets, seriesBySymbol, quality, priceNow, ...portfolio, health, rsi, riskProfile, dataQuality, cryptoWeight, today };
}

export { valueHistory, normalizeSeries };
