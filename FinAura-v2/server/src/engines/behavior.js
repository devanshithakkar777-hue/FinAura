import { addDays, diffDays, monthKey, monthsBetween } from '../lib/dates.js';
import { priceOn, trailingReturn, forwardReturn, median } from '../lib/series.js';
import { sortTxns } from './portfolio.js';
import { maxCryptoFor } from './health.js';

/** Per-volatility thresholds (trailing 7-day drop that makes a sell "panic-like", 30-day run-up that makes a buy "FOMO-like"). */
export const PANIC_DROP = { Low: -0.03, Moderate: -0.06, High: -0.12 };
export const FOMO_RUNUP = { Low: 0.06, Moderate: 0.12, High: 0.25 };

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Tag each transaction with market context and a behavioural label.
 * @param seriesBySymbol Map symbol -> ascending series
 * @param assets Map symbol -> {volatility}
 */
export function tagTransactions(txns, seriesBySymbol, assets, today) {
  return sortTxns(txns).map(t => {
    const series = seriesBySymbol.get(t.symbol) ?? [];
    const vol = assets.get(t.symbol)?.volatility ?? 'Moderate';
    const day = t.executed_on;
    const r7 = trailingReturn(series, day, 7);
    const r30 = trailingReturn(series, day, 30);
    const f30 = forwardReturn(series, day, 30, today);
    const nowPrice = priceOn(series, today) ?? Number(t.price);
    let tag = null;
    if (t.side === 'sell' && ((r7 !== null && r7 <= PANIC_DROP[vol]) || (r30 !== null && r30 <= PANIC_DROP[vol] * 2))) tag = 'panic_sell';
    if (t.side === 'buy' && r30 !== null && r30 >= FOMO_RUNUP[vol]) tag = 'fomo_buy';
    const qty = Number(t.quantity), price = Number(t.price);
    // For sells: contribution to "behavioural alpha" = what selling did to final wealth vs. holding on.
    const contribution = t.side === 'sell' ? qty * (price - nowPrice) : 0;
    return { id: t.id, symbol: t.symbol, side: t.side, day, quantity: qty, price, volatility: vol, r7, r30, f30, tag, contribution, nowPrice };
  });
}

/** Detect systematic (SIP-like) buying: ≥3 buys of a symbol with mostly ~monthly spacing. */
export function detectSip(txns) {
  const bySym = {};
  sortTxns(txns).filter(t => t.side === 'buy').forEach(t => { (bySym[t.symbol] ??= []).push(t.executed_on); });
  const sip = [];
  for (const [sym, days] of Object.entries(bySym)) {
    if (days.length < 3) continue;
    const gaps = days.slice(1).map((d, i) => diffDays(d, days[i]));
    const ok = gaps.filter(g => g >= 20 && g <= 40).length;
    if (ok / gaps.length >= 0.7) sip.push(sym);
  }
  return sip;
}

export function analyzeBehavior({ txns, seriesBySymbol, assets, positionsInfo, riskProfile = 'Moderate', today, dataQuality = 'market' }) {
  const sorted = sortTxns(txns);
  if (sorted.length < 4) {
    return { status: 'insufficient_data', needed: 4 - sorted.length, message: 'Log at least 4 trades (or load the demo portfolio) to unlock your behavioural analysis.' };
  }
  const tagged = tagTransactions(sorted, seriesBySymbol, assets, today);
  const buys = tagged.filter(t => t.side === 'buy');
  const sells = tagged.filter(t => t.side === 'sell');
  const panic = tagged.filter(t => t.tag === 'panic_sell');
  const fomo = tagged.filter(t => t.tag === 'fomo_buy');

  const alphaAmount = sells.reduce((s, t) => s + t.contribution, 0);
  const totalInvested = buys.reduce((s, t) => s + t.quantity * t.price, 0);
  const panicCost = panic.reduce((s, t) => s + Math.min(0, t.contribution), 0);
  const withF30 = panic.filter(t => t.f30 !== null).map(t => t.f30);

  // Consistency over the trailing window (≤12 months)
  const firstDay = sorted[0].executed_on;
  const windowMonths = Math.max(1, Math.min(12, monthsBetween(monthKey(firstDay), monthKey(today)) + 1));
  const months = new Set();
  for (let i = 0; i < windowMonths; i++) {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - i);
    months.add(d.toISOString().slice(0, 7));
  }
  const buyMonths = new Set(buys.map(b => monthKey(b.day)).filter(m => months.has(m)));
  const consistencyRatio = buyMonths.size / windowMonths;

  const sipSymbols = detectSip(sorted);
  const panicRate = sells.length ? panic.length / sells.length : 0;
  const fomoRate = buys.length ? fomo.length / buys.length : 0;
  const tradesPerMonth = sorted.length / Math.max(1, monthsBetween(monthKey(firstDay), monthKey(today)) + 1);

  const { positions = [], cryptoWeight = 0, health } = positionsInfo ?? {};
  const topWeight = positions.length ? Math.max(...positions.map(p => p.weight)) : 0;

  const patience = clamp(100 - panicRate * 150 - Math.max(0, tradesPerMonth - 8) * 4 - (sells.length ? 0 : -5)) ;
  const discipline = clamp(100 - fomoRate * 80 + (sipSymbols.length ? 15 : 0));
  const consistency = clamp(consistencyRatio * 100);
  const riskMgmt = clamp(100 - Math.max(0, cryptoWeight - maxCryptoFor(riskProfile)) * 300 - Math.max(0, topWeight - 0.4) * 100);
  const diversification = clamp(health?.diversification ?? 50);
  const traits = {
    patience: Math.round(patience), discipline: Math.round(discipline), consistency: Math.round(consistency),
    riskMgmt: Math.round(riskMgmt), diversification: Math.round(diversification),
  };
  const overall = Math.round(traits.patience * 0.25 + traits.discipline * 0.25 + traits.consistency * 0.2 + traits.riskMgmt * 0.15 + traits.diversification * 0.15);

  const patterns = [];
  if (panic.length) {
    patterns.push({
      key: 'panic_selling', label: 'Panic selling', severity: panic.length >= 2 || panicRate >= 0.4 ? 'concern' : 'watch',
      detail: `${panic.length} of ${sells.length} sells came right after a sharp drop.` + (withF30.length ? ` A month later the price was ${withF30.filter(x => x > 0).length}/${withF30.length} times higher.` : ''),
      evidence: panic.map(t => t.id),
    });
  } else if (sells.length) {
    patterns.push({ key: 'calm_selling', label: 'Calm selling', severity: 'good', detail: 'None of your sells followed a sharp drop.', evidence: [] });
  }
  if (fomo.length) {
    patterns.push({
      key: 'fomo_buying', label: 'Chasing rallies', severity: fomo.length >= 2 || fomoRate >= 0.4 ? 'concern' : 'watch',
      detail: `${fomo.length} of ${buys.length} buys came after a big run-up.`, evidence: fomo.map(t => t.id),
    });
  }
  if (sipSymbols.length) {
    patterns.push({ key: 'sip_habit', label: 'Systematic investing', severity: 'good', detail: `Regular monthly buying detected in ${sipSymbols.join(', ')}.`, evidence: [] });
  }
  patterns.push({
    key: 'consistency', label: 'Contribution consistency',
    severity: consistencyRatio >= 0.75 ? 'good' : consistencyRatio >= 0.4 ? 'watch' : 'concern',
    detail: `You added money in ${buyMonths.size} of the last ${windowMonths} months.`, evidence: [],
  });
  if (cryptoWeight > maxCryptoFor(riskProfile)) {
    patterns.push({ key: 'risk_drift', label: 'Risk drift', severity: 'watch', detail: `Crypto is ${Math.round(cryptoWeight * 100)}% of your portfolio, above the ${Math.round(maxCryptoFor(riskProfile) * 100)}% guideline for ${riskProfile}.`, evidence: [] });
  }

  return {
    status: 'ok',
    score: overall,
    traits,
    alpha: {
      amount: Math.round(alphaAmount),
      pct: totalInvested ? alphaAmount / totalInvested : 0,
      panicCost: Math.round(panicCost),
      sellCount: sells.length,
      explanation: 'Compares your actual wealth with a "stay the course" version of you who made the same purchases but never sold. Negative means selling cost you; positive means your sells helped.',
    },
    evidence: {
      panicSells: panic.length, fomoBuys: fomo.length,
      avgForward30AfterPanic: withF30.length ? withF30.reduce((a, b) => a + b, 0) / withF30.length : null,
      medianForward30AfterPanic: median(withF30),
      sipSymbols,
    },
    patterns,
    events: tagged.filter(t => t.tag).map(t => ({ id: t.id, symbol: t.symbol, side: t.side, day: t.day, tag: t.tag, contribution: Math.round(t.contribution) })),
    dataQuality,
    stats: { trades: sorted.length, buys: buys.length, sells: sells.length, tradesPerMonth: Math.round(tradesPerMonth * 10) / 10 },
  };
}

export { addDays };
