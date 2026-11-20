/**
 * Financial digital twin: Monte-Carlo replay of a portfolio through market scenarios,
 * comparing "you, with your habits" against "a disciplined version of you".
 * Deterministic for a given seed.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Annualised assumptions per asset class: drift, volatility, beta to the market factor.
const CLASS = {
  equity:     { mu: 0.10, sigma: 0.18, beta: 1.0 },
  mutualFund: { mu: 0.09, sigma: 0.14, beta: 0.85 },
  crypto:     { mu: 0.15, sigma: 0.70, beta: 1.6 },
  bond:       { mu: 0.05, sigma: 0.05, beta: 0.1 },
  gold:       { mu: 0.06, sigma: 0.15, beta: 0.0 },
  cash:       { mu: 0.04, sigma: 0.005, beta: 0.0 },
};

/** Shocks applied on top of normal drift, as total market-factor return spread over `months`, then a recovery. */
export const SCENARIOS = {
  baseline:      { label: 'Normal markets', shockMonths: 0, shock: 0, recoveryMonths: 0, cryptoExtra: 0 },
  crash:         { label: 'Sharp crash (2008 / 2020 style)', shockMonths: 3, shock: -0.35, recoveryMonths: 24, cryptoExtra: -0.25 },
  slow_bear:     { label: 'Slow bear market', shockMonths: 18, shock: -0.30, recoveryMonths: 30, cryptoExtra: -0.20 },
  crypto_winter: { label: 'Crypto winter', shockMonths: 9, shock: -0.05, recoveryMonths: 24, cryptoExtra: -0.65 },
};

const pctile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/**
 * @param weights  { [assetClass]: weight } summing to ~1
 * @param habits   { panicProb: 0..1 (chance of selling when threshold breached), panicThreshold: negative drawdown e.g. -0.2, reentryMonths }
 * @param opts     { startValue, monthlyContribution, years, scenario, paths, seed }
 */
export function runTwin(weights, habits, opts) {
  const { startValue, monthlyContribution = 0, years = 10, scenario = 'crash', paths = 400, seed = 1 } = opts;
  const sc = SCENARIOS[scenario] ?? SCENARIOS.crash;
  const months = years * 12;
  const classes = Object.keys(weights).filter(k => weights[k] > 0 && CLASS[k]);
  const norm = classes.reduce((s, k) => s + weights[k], 0) || 1;
  const w = Object.fromEntries(classes.map(k => [k, weights[k] / norm]));

  // Shock begins after month 6 so the user sees pre-crash growth first.
  const SHOCK_START = 6;

  const simulate = (behaviour, rand) => {
    const bal = Object.fromEntries(classes.map(k => [k, startValue * w[k]]));
    let cash = 0, peak = startValue, sold = false;
    // Habit model: people capitulate with a lag after the drawdown threshold is crossed, and only return
    // once enough time has passed AND the market has visibly recovered from its low.
    let mktIdx = 1, pendingSellAt = -1, soldAt = -1, troughSinceSale = Infinity;
    const track = [];
    for (let m = 1; m <= months; m++) {
      const market = gauss(rand);
      let marketShock = 0, cryptoShock = 0;
      if (sc.shockMonths && m > SHOCK_START && m <= SHOCK_START + sc.shockMonths) {
        marketShock = Math.log(1 + sc.shock) / sc.shockMonths;
        cryptoShock = Math.log(1 + sc.cryptoExtra) / sc.shockMonths;
      } else if (sc.recoveryMonths && m > SHOCK_START + sc.shockMonths && m <= SHOCK_START + sc.shockMonths + sc.recoveryMonths) {
        const lost = Math.abs(sc.shock);
        marketShock = Math.log(1 / (1 - lost)) / sc.recoveryMonths * 0.9;
        cryptoShock = Math.log(1 / (1 + sc.cryptoExtra)) / sc.recoveryMonths * 0.5;
      }
      mktIdx *= Math.exp((CLASS.equity.mu - 0.5 * CLASS.equity.sigma ** 2) / 12 + (CLASS.equity.sigma / Math.sqrt(12)) * 0.7 * market + marketShock);
      for (const k of classes) {
        const c = CLASS[k];
        const idio = gauss(rand);
        const sigmaM = c.sigma / Math.sqrt(12);
        const drift = (c.mu - 0.5 * c.sigma ** 2) / 12;
        const shock = marketShock * c.beta + (k === 'crypto' ? cryptoShock : 0);
        const ret = drift + sigmaM * (0.7 * market * Math.sign(c.beta || 1) + 0.714 * idio) + shock;
        bal[k] *= Math.exp(ret);
      }
      // monthly contribution, split by target weights (or into cash if user has "sold out")
      if (sold) cash += monthlyContribution; else for (const k of classes) bal[k] += monthlyContribution * w[k];
      cash *= 1 + 0.04 / 12;
      const total = classes.reduce((s, k) => s + bal[k], 0) + cash;
      peak = Math.max(peak, total);

      if (behaviour && !sold && pendingSellAt < 0 && behaviour.panicProb > 0 && total / peak - 1 <= behaviour.panicThreshold && rand() < behaviour.panicProb) {
        pendingSellAt = m + (behaviour.lagMonths ?? 2);
      }
      if (pendingSellAt > 0 && m >= pendingSellAt && !sold) {
        const frac = 0.7;
        for (const k of classes) if (k !== 'bond' && k !== 'cash') { cash += bal[k] * frac; bal[k] *= 1 - frac; }
        sold = true; soldAt = m; pendingSellAt = -1; troughSinceSale = mktIdx;
      } else if (sold) {
        troughSinceSale = Math.min(troughSinceSale, mktIdx);
        if (m - soldAt >= behaviour.reentryMonths && mktIdx >= troughSinceSale * 1.10) {
          for (const k of classes) { bal[k] += cash * w[k]; }
          cash = 0; sold = false; peak = classes.reduce((s2, k) => s2 + bal[k], 0);
        }
      }
      track.push(classes.reduce((s, k) => s + bal[k], 0) + cash);
    }
    return track;
  };

  const run = (behaviour, salt) => {
    const rand = mulberry32(seed + salt);
    const all = [];
    for (let p = 0; p < paths; p++) all.push(simulate(behaviour, mulberry32(Math.floor(rand() * 4294967296))));
    return all;
  };

  // Same market paths for both runs (same salt) so differences are due to behaviour alone.
  const disciplined = run(null, 0);
  const habit = run(habits, 0);

  const bands = tracks => {
    const out = [];
    for (let m = 0; m < months; m++) {
      if (m % 3 !== 2 && m !== months - 1) continue; // quarterly points keep the payload small
      const col = tracks.map(t => t[m]).sort((a, b) => a - b);
      out.push({ month: m + 1, p10: Math.round(pctile(col, 0.1)), p50: Math.round(pctile(col, 0.5)), p90: Math.round(pctile(col, 0.9)) });
    }
    return out;
  };
  const finalMedian = tracks => pctile(tracks.map(t => t[months - 1]).sort((a, b) => a - b), 0.5);
  const dMed = finalMedian(disciplined), hMed = finalMedian(habit);
  const invested = startValue + monthlyContribution * months;

  // Worst drawdown experienced by the median path
  const maxDrawdown = tracks => {
    const col = [];
    for (let m = 0; m < months; m++) col.push(pctile(tracks.map(t => t[m]).sort((a, b) => a - b), 0.5));
    let peak = col[0], dd = 0;
    for (const v of col) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
    return dd;
  };

  return {
    scenario, scenarioLabel: sc.label, years, paths, startValue, monthlyContribution, invested,
    disciplined: { bands: bands(disciplined), finalMedian: Math.round(dMed), maxDrawdown: maxDrawdown(disciplined) },
    habit: { bands: bands(habit), finalMedian: Math.round(hMed), maxDrawdown: maxDrawdown(habit) },
    costOfHabits: Math.round(dMed - hMed),
    costOfHabitsPct: dMed ? (dMed - hMed) / dMed : 0,
    habits,
    assumptions: 'Illustrative simulation using fixed return/volatility assumptions per asset class. The habit path assumes you sell with a ~2-month lag after crossing your drawdown threshold and buy back only after the market has rebounded ~10% from its low. Not a forecast.',
  };
}

/** Derive habit parameters from behavioural analysis. */
export function habitsFromBehavior(behavior) {
  if (!behavior || behavior.status !== 'ok') return { panicProb: 0.35, panicThreshold: -0.18, reentryMonths: 6, derived: false };
  const { panicSells } = behavior.evidence;
  const { sells } = behavior.stats;
  const rate = sells ? panicSells / sells : 0;
  const patience = behavior.traits.patience;
  return {
    panicProb: Math.round(Math.min(0.9, Math.max(0.05, rate * 0.8 + (100 - patience) / 250)) * 100) / 100,
    panicThreshold: patience < 50 ? -0.12 : patience < 75 ? -0.18 : -0.25,
    reentryMonths: patience < 50 ? 9 : 6, lagMonths: 2,
    derived: true,
  };
}
