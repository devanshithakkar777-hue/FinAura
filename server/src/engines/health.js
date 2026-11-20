import { rsi } from '../lib/series.js';

const WEIGHTS = { diversification: 0.30, volatility: 0.25, cryptoExposure: 0.20, riskAlignment: 0.25 };

export const maxCryptoFor = rp => (rp === 'Conservative' ? 0.05 : rp === 'Aggressive' ? 0.40 : 0.20);

export const ZERO_HEALTH = { total: 0, diversification: 0, volatility: 0, cryptoExposure: 0, riskAlignment: 0 };

/**
 * Portfolio health from real positions.
 * @param positions [{assetClass, value, volatility, symbol}]
 * @param riskProfile 'Conservative'|'Moderate'|'Aggressive'
 * @param rsiBySymbol Map symbol -> RSI(14) or undefined
 */
export function computeHealth(positions, riskProfile = 'Moderate', rsiBySymbol = new Map()) {
  const total = positions.reduce((s, p) => s + p.value, 0);
  if (!positions.length || total <= 0) return ZERO_HEALTH;

  const byClass = {};
  positions.forEach(p => { byClass[p.assetClass] = (byClass[p.assetClass] ?? 0) + p.value; });
  const classCount = Object.keys(byClass).length;
  const maxAlloc = Math.max(...Object.values(byClass)) / total;
  const diversification = Math.round(Math.min(100, (classCount / 4) * 60 + (1 - maxAlloc) * 40));

  const volatility = Math.round(positions.reduce((s, p) => {
    const v = p.volatility === 'Low' ? 100 : p.volatility === 'Moderate' ? 65 : 30;
    return s + v * (p.value / total);
  }, 0));

  const cryptoPct = (byClass.crypto ?? 0) / total;
  const cryptoExposure = Math.round(Math.max(0, 100 - Math.max(0, cryptoPct - maxCryptoFor(riskProfile)) * 300));

  const avgRsi = positions.reduce((s, p) => s + (rsiBySymbol.get(p.symbol) ?? 50) * (p.value / total), 0);
  const penalty = avgRsi > 70 ? (avgRsi - 70) * 2 : avgRsi < 30 ? (30 - avgRsi) * 1.5 : 0;
  const riskAlignment = Math.round(Math.max(0, 100 - penalty));

  const totalScore = Math.round(
    diversification * WEIGHTS.diversification + volatility * WEIGHTS.volatility +
    cryptoExposure * WEIGHTS.cryptoExposure + riskAlignment * WEIGHTS.riskAlignment);
  return { total: totalScore, diversification, volatility, cryptoExposure, riskAlignment, avgRsi: Math.round(avgRsi) };
}

export function rsiMap(seriesBySymbol) {
  const m = new Map();
  for (const [sym, s] of seriesBySymbol) {
    const r = rsi(s);
    if (r !== null) m.set(sym, Math.round(r));
  }
  return m;
}
