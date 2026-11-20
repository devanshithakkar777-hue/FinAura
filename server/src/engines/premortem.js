import { addDays, diffDays } from '../lib/dates.js';
import { priceOn, trailingReturn, median } from '../lib/series.js';
import { tagTransactions, PANIC_DROP, FOMO_RUNUP } from './behavior.js';
import { maxCryptoFor } from './health.js';

/**
 * Historical analogue: every time this asset's own series fell by ≤ threshold over 7 days
 * (distinct episodes ≥14 days apart), what did the next 30 days look like?
 */
function marketEvidence(series, threshold, today) {
  const out = [];
  let lastEpisode = null;
  for (const pt of series) {
    if (lastEpisode && diffDays(pt.day, lastEpisode) < 14) continue;
    const r7 = trailingReturn(series, pt.day, 7);
    if (r7 === null || r7 > threshold) continue;
    if (diffDays(today, pt.day) < 30) continue;
    const f = priceOn(series, addDays(pt.day, 30)) / pt.close - 1;
    out.push(f);
    lastEpisode = pt.day;
  }
  return out.length >= 2
    ? { episodes: out.length, medianForward30: median(out), positiveShare: out.filter(x => x > 0).length / out.length }
    : null;
}

/**
 * Pre-mortem for a proposed trade. Pure function.
 * `price` is the price the user expects to trade at (defaults to latest close).
 */
export function runPremortem({ symbol, side, quantity, price, series, asset, txns, seriesBySymbol, assets, positions, riskProfile = 'Moderate', today }) {
  const vol = asset?.volatility ?? 'Moderate';
  const px = price ?? priceOn(series, today);
  const r7 = trailingReturn(series, today, 7);
  const r30 = trailingReturn(series, today, 30);
  const window90 = series.filter(s => diffDays(today, s.day) <= 90).map(s => s.close);
  const high90 = window90.length ? Math.max(...window90) : px;
  const drawdown = high90 ? px / high90 - 1 : 0;

  const pos = positions.find(p => p.symbol === symbol);
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const tradeValue = quantity * px;
  const signals = [];
  let score = 0;

  const tagged = tagTransactions(txns, seriesBySymbol, assets, today);
  const personalHistory = tagged.filter(t => t.tag === (side === 'sell' ? 'panic_sell' : 'fomo_buy') && t.f30 !== null);
  const personalForward = personalHistory.map(t => t.f30);
  const personal = personalHistory.length
    ? {
        count: personalHistory.length,
        avgForward30: personalForward.reduce((a, b) => a + b, 0) / personalForward.length,
        regretShare: personalForward.filter(f => (side === 'sell' ? f > 0 : f < 0)).length / personalForward.length,
      }
    : null;

  let consequences;

  if (side === 'sell') {
    if (!pos || quantity > pos.quantity + 1e-6) {
      return { error: 'You do not hold that much of this asset.' };
    }
    const frac = quantity / pos.quantity;
    consequences = { tradeValue, fractionOfPosition: frac, holdingDays: pos.oldestLotDays, estimatedRealisedPnl: quantity * (px - pos.avgCost) };
    if (r7 !== null && r7 <= PANIC_DROP[vol]) { score += 2; signals.push({ key: 'sharp_drop', label: 'Sharp recent drop', detail: `${symbol} is ${(r7 * 100).toFixed(1)}% over the last 7 days.`, weight: 2 }); }
    else if (r30 !== null && r30 <= PANIC_DROP[vol] * 2) { score += 1; signals.push({ key: 'month_drop', label: 'Weak month', detail: `${symbol} is ${(r30 * 100).toFixed(1)}% over 30 days.`, weight: 1 }); }
    if (drawdown <= -0.15) { score += 1; signals.push({ key: 'deep_drawdown', label: 'Deep drawdown', detail: `${(drawdown * 100).toFixed(0)}% below its 90-day high — selling now locks in the low.`, weight: 1 }); }
    if (frac >= 0.5) { score += 1; signals.push({ key: 'large_exit', label: 'Large exit', detail: `You are selling ${(frac * 100).toFixed(0)}% of this position.`, weight: 1 }); }
    if (px < pos.avgCost) { score += 1; signals.push({ key: 'realising_loss', label: 'Realising a loss', detail: `Selling below your average cost of ${pos.avgCost.toFixed(2)}.`, weight: 1 }); }
    if (personal && personal.regretShare >= 0.5) { score += 1; signals.push({ key: 'personal_pattern', label: 'Your own pattern', detail: `After ${personal.count} past sells in similar conditions, the price was higher a month later ${Math.round(personal.regretShare * 100)}% of the time.`, weight: 1 }); }
  } else {
    const newWeight = totalValue + tradeValue ? ((pos?.value ?? 0) + tradeValue) / (totalValue + tradeValue) : 1;
    if (r30 !== null && r30 >= FOMO_RUNUP[vol]) { score += 2; signals.push({ key: 'big_runup', label: 'Big recent run-up', detail: `${symbol} is +${(r30 * 100).toFixed(1)}% over 30 days.`, weight: 2 }); }
    else if (r7 !== null && r7 >= FOMO_RUNUP[vol] / 2) { score += 1; signals.push({ key: 'hot_week', label: 'Hot week', detail: `${symbol} is +${(r7 * 100).toFixed(1)}% over 7 days.`, weight: 1 }); }
    if (newWeight > 0.35) { score += 1; signals.push({ key: 'concentration', label: 'Concentration', detail: `This would make ${symbol} ${(newWeight * 100).toFixed(0)}% of your portfolio.`, weight: 1 }); }
    if (asset?.asset_class === 'crypto') {
      const cryptoNow = positions.filter(p => p.assetClass === 'crypto').reduce((s, p) => s + p.value, 0);
      const cryptoAfter = (cryptoNow + tradeValue) / (totalValue + tradeValue);
      if (cryptoAfter > maxCryptoFor(riskProfile)) { score += 2; signals.push({ key: 'crypto_cap', label: 'Above crypto guideline', detail: `Crypto would be ${(cryptoAfter * 100).toFixed(0)}% vs a ${(maxCryptoFor(riskProfile) * 100).toFixed(0)}% guideline for ${riskProfile}.`, weight: 2 }); }
    }
    if (personal && personal.regretShare >= 0.5) { score += 1; signals.push({ key: 'personal_pattern', label: 'Your own pattern', detail: `${Math.round(personal.regretShare * 100)}% of your past buys after rallies were lower a month later.`, weight: 1 }); }
    consequences = { tradeValue, fractionOfPosition: null, holdingDays: null, estimatedRealisedPnl: null, newWeight };
  }

  const riskLevel = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  // Historical analogue is defined for drops, so it only applies to sells.
  const evidence = {
    personal,
    market: side === 'sell' && series.length >= 60 ? marketEvidence(series, PANIC_DROP[vol], today) : null,
  };

  const checklist = side === 'sell'
    ? [
        'Has anything about this investment changed fundamentally, or is it only the price?',
        'Do you need this money in the next few months?',
        'If you held cash today instead, would you buy this at the current price?',
        'Would you be comfortable explaining this sell to yourself in 30 days?',
      ]
    : [
        'Would you still want this if the price were 15% lower tomorrow?',
        'Is this part of your plan, or a reaction to recent gains?',
        'What would you sell, or skip, to make room for this?',
        'Is the amount within what you can leave invested for 5+ years?',
      ];

  const cooldownHours = riskLevel === 'high' ? 24 : 0;
  const headline = riskLevel === 'high'
    ? side === 'sell' ? 'Hold on — this looks like a reaction to the drop.' : 'Pause — this looks like chasing the rally.'
    : riskLevel === 'medium' ? 'A few flags worth a minute of thought.' : 'No behavioural red flags detected.';

  const taxNote = side === 'sell' && consequences.estimatedRealisedPnl !== null
    ? `Selling may realise ${consequences.estimatedRealisedPnl >= 0 ? 'a gain' : 'a loss'} of about ${Math.round(consequences.estimatedRealisedPnl).toLocaleString()} on a ${consequences.holdingDays}-day-old position. Capital-gains tax rules depend on holding period and asset type — verify with a tax professional.`
    : null;

  return {
    riskLevel, score, headline, signals, evidence, checklist, cooldownHours, consequences, taxNote,
    context: { price: px, return7d: r7, return30d: r30, drawdownFrom90dHigh: drawdown },
    disclaimer: 'Educational analysis based on your history and price data. Not investment advice.',
  };
}
