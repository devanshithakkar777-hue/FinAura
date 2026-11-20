import { diffDays } from '../lib/dates.js';
import { explain } from '../lib/explain.js';

export const INFLATION = 0.06;
export const EXPECTED_RETURN = { equity: 0.10, mutualFund: 0.09, crypto: 0.12, bond: 0.065, gold: 0.06, cash: 0.04, realEstate: 0.07 };
const SWR = 0.035;          // sustainable withdrawal rate (conservative for India)
const LIFE_EXPECTANCY = 85;
const r2 = n => Math.round(n * 100) / 100;

export const blendedReturn = allocation => {
  const tot = allocation.reduce((s, a) => s + a.value, 0);
  if (!tot) return 0.08;
  return allocation.reduce((s, a) => s + (EXPECTED_RETURN[a.group ?? a.assetClass] ?? 0.07) * a.value / tot, 0);
};

/** Future value of a lump sum plus a monthly SIP that steps up each year. */
export function futureValue(start, monthly, years, rate, stepUp = 0) {
  let v = start; const mr = Math.pow(1 + rate, 1 / 12) - 1; let sip = monthly;
  const months = Math.round(years * 12);
  for (let m = 1; m <= months; m++) {
    v = v * (1 + mr) + sip;
    if (m % 12 === 0) sip *= 1 + stepUp;
  }
  return v;
}

export function wealthProjection({ start, monthly, years, rate, stepUp = 0 }) {
  const pts = [];
  for (let y = 0; y <= Math.min(60, Math.ceil(years)); y++) {
    const nominal = futureValue(start, monthly, y, rate, stepUp);
    pts.push({ year: y, nominal: r2(nominal), real: r2(nominal / Math.pow(1 + INFLATION, y)) });
  }
  return pts;
}

/** Monthly SIP needed so that start + SIP reaches `target` after `years`. */
export function requiredSip(start, target, years, rate) {
  const n = Math.round(years * 12), mr = Math.pow(1 + rate, 1 / 12) - 1;
  const gap = target - start * Math.pow(1 + mr, n);
  if (gap <= 0) return 0;
  return mr > 0 ? gap * mr / (Math.pow(1 + mr, n) - 1) : gap / Math.max(1, n);
}

export function retirementPlan({ profile, investable, monthlySaving = 0, allocation = [] }) {
  const { age, retirementAge, monthlyExpenses } = profile;
  if (!age || !retirementAge || !monthlyExpenses) return { ready: false, missing: ['age', 'retirementAge', 'monthlyExpenses'].filter(k => !profile[k]) };
  const years = Math.max(0, retirementAge - age);
  const rate = blendedReturn(allocation);
  const expensesAtRetirement = monthlyExpenses * 12 * Math.pow(1 + INFLATION, years);
  const corpusNeeded = expensesAtRetirement / SWR;
  const projected = futureValue(investable, monthlySaving, years, rate);
  const ratio = corpusNeeded ? projected / corpusNeeded : 0;
  const sip = requiredSip(investable, corpusNeeded, years, rate);
  const payoutYears = Math.max(0, LIFE_EXPECTANCY - retirementAge);
  const status = ratio >= 1 ? 'on_track' : ratio >= 0.7 ? 'close' : 'behind';
  return {
    ready: true, years, assumedReturn: r2(rate * 100) / 100, inflation: INFLATION, withdrawalRate: SWR,
    expensesAtRetirementAnnual: r2(expensesAtRetirement), corpusNeeded: r2(corpusNeeded), projectedCorpus: r2(projected),
    readiness: r2(ratio), status, shortfall: r2(Math.max(0, corpusNeeded - projected)),
    requiredMonthlySip: r2(sip), extraSipNeeded: r2(Math.max(0, sip - monthlySaving)), payoutYears,
    explain: explain({
      title: 'Retirement readiness',
      verdict: status === 'on_track' ? 'You are on track to fund your expenses.' : `You are projected to reach ${Math.round(ratio * 100)}% of the corpus you need.`,
      why: [`Your expenses of ${r2(monthlyExpenses)}/month grow ${INFLATION * 100}%/yr to ${r2(expensesAtRetirement / 12)}/month by age ${retirementAge}.`, `A ${SWR * 100}% withdrawal rate needs a corpus of ${r2(corpusNeeded)}.`],
      inputs: { age, retirementAge, monthlyExpenses, investable, monthlySaving, assumedReturn: rate },
      risks: ['Returns are assumptions, not forecasts; a weak decade early on hurts most.', 'Inflation above 6% raises the corpus needed.', 'Longevity beyond 85 would stretch the corpus.'],
      alternatives: ['Retire a few years later.', 'Raise the SIP, ideally stepping it up with income.', 'Reduce planned retirement expenses.'],
      confidence: years > 25 ? 0.4 : years > 10 ? 0.55 : 0.7,
      uncertainty: 'The further away retirement is, the wider the realistic range of outcomes.',
    }),
  };
}

export function emergencyFund({ profile, liquid, monthlyEmi = 0 }) {
  const exp = profile.monthlyExpenses;
  if (!exp) return { ready: false, missing: ['monthlyExpenses'] };
  const months = 6 + (profile.dependents > 0 ? 3 : 0);
  const monthlyNeed = exp + monthlyEmi;
  const target = monthlyNeed * months;
  const coverage = monthlyNeed ? liquid / monthlyNeed : 0;
  return {
    ready: true, targetMonths: months, monthlyNeed: r2(monthlyNeed), target: r2(target), liquid: r2(liquid),
    coverageMonths: r2(coverage), gap: r2(Math.max(0, target - liquid)), status: coverage >= months ? 'funded' : coverage >= months / 2 ? 'partial' : 'low',
    explain: explain({
      title: 'Emergency fund',
      verdict: coverage >= months ? 'Your emergency fund is fully funded.' : `You hold ${coverage.toFixed(1)} of the ${months} months of cover recommended.`,
      why: [`Expenses plus EMIs come to ${r2(monthlyNeed)}/month.`, `${profile.dependents > 0 ? 'Dependents add three months to the usual six.' : 'Six months is the usual target.'}`],
      inputs: { monthlyExpenses: exp, monthlyEmi, liquid, dependents: profile.dependents },
      risks: ['Liquid assets that fall in a crash (equity, crypto) are excluded; only cash-like assets count.'],
      alternatives: ['Build the gap gradually in a liquid fund or a sweep-in FD.', 'Keep a credit line as a second buffer, not a substitute.'],
      confidence: 0.8, uncertainty: 'Your real expenses may be higher in an emergency such as a medical event.',
    }),
  };
}

// ── Rebalancing ──────────────────────────────────────────────────────
export const TARGETS = {
  Conservative: { equity: 0.20, mutualFund: 0.10, bond: 0.35, cash: 0.15, gold: 0.15, crypto: 0.02, realEstate: 0.03 },
  Moderate:     { equity: 0.35, mutualFund: 0.20, bond: 0.15, cash: 0.08, gold: 0.10, crypto: 0.05, realEstate: 0.07 },
  Aggressive:   { equity: 0.45, mutualFund: 0.25, bond: 0.05, cash: 0.05, gold: 0.07, crypto: 0.08, realEstate: 0.05 },
};

export function rebalance({ allocation, riskProfile = 'Moderate', newMoney = 0 }) {
  const target = TARGETS[riskProfile] ?? TARGETS.Moderate;
  const total = allocation.reduce((s, a) => s + a.value, 0);
  if (!total) return { ready: false };
  const cur = Object.fromEntries(allocation.map(a => [a.group ?? a.assetClass, a.value]));
  const after = total + newMoney;
  const rows = Object.keys({ ...target, ...cur }).map(g => {
    const value = cur[g] ?? 0, tw = target[g] ?? 0;
    const weight = value / total, drift = weight - tw;
    return { group: g, value: r2(value), weight: r2(weight), target: tw, drift: r2(drift), tradeToTarget: r2(tw * after - value) };
  }).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  // Spend new money on the most underweight groups first (avoids selling and realising tax).
  let left = newMoney; const buyPlan = [];
  for (const r of rows.filter(x => x.tradeToTarget > 0).sort((a, b) => b.tradeToTarget - a.tradeToTarget)) {
    if (left <= 0) break;
    const amt = Math.min(left, r.tradeToTarget); buyPlan.push({ group: r.group, amount: r2(amt) }); left -= amt;
  }
  const maxDrift = Math.max(...rows.map(r => Math.abs(r.drift)));
  const needs = maxDrift > 0.10;
  return {
    ready: true, riskProfile, totalValue: r2(total), maxDrift: r2(maxDrift), needsRebalance: needs, rows, buyPlan,
    explain: explain({
      title: 'Rebalancing',
      verdict: needs ? `Your largest allocation is ${Math.round(maxDrift * 100)} points away from target.` : 'Your allocation is within tolerance of target.',
      why: [`The ${riskProfile} reference mix is a starting point, not a prescription.`, newMoney ? 'New money is directed to underweight groups first so you do not have to sell.' : 'Drift above 10 points usually merits action.'],
      inputs: { riskProfile, allocation: cur, newMoney },
      risks: ['Selling to rebalance can realise taxable gains and exit loads.', 'Illiquid assets such as property cannot be rebalanced quickly.'],
      alternatives: ['Rebalance only with fresh contributions.', 'Rebalance on a fixed schedule (annually) instead of continuously.'],
      confidence: 0.6, uncertainty: 'Target mixes are generic; your goals and horizon may justify a different one.',
    }),
  };
}

// ── Buy / sell / hold signals ────────────────────────────────────────
const sma = (series, n) => (series.length >= n ? series.slice(-n).reduce((s, x) => s + x.close, 0) / n : null);

export function signalFor(position, series, rsiValue, riskProfile = 'Moderate') {
  const factors = [];
  let score = 0;                      // + leans buy/accumulate, - leans trim/sell
  if (rsiValue != null) {
    if (rsiValue >= 75) { score -= 2; factors.push({ name: 'RSI', value: rsiValue, effect: 'negative', note: 'Strongly overbought — pullbacks are common from here.' }); }
    else if (rsiValue >= 70) { score -= 1; factors.push({ name: 'RSI', value: rsiValue, effect: 'negative', note: 'Overbought.' }); }
    else if (rsiValue <= 25) { score += 2; factors.push({ name: 'RSI', value: rsiValue, effect: 'positive', note: 'Deeply oversold — can mean opportunity or a falling knife.' }); }
    else if (rsiValue <= 30) { score += 1; factors.push({ name: 'RSI', value: rsiValue, effect: 'positive', note: 'Oversold.' }); }
    else factors.push({ name: 'RSI', value: rsiValue, effect: 'neutral', note: 'Neutral momentum.' });
  }
  const s50 = sma(series, 50), last = series.at?.(-1)?.close ?? null;
  if (s50 && last) {
    const gap = last / s50 - 1;
    if (gap > 0.15) { score -= 1; factors.push({ name: 'Trend vs 50-day average', value: r2(gap), effect: 'negative', note: 'Price is stretched well above its average.' }); }
    else if (gap < -0.10) { score += 1; factors.push({ name: 'Trend vs 50-day average', value: r2(gap), effect: 'positive', note: 'Price is well below its recent average.' }); }
    else factors.push({ name: 'Trend vs 50-day average', value: r2(gap), effect: 'neutral', note: 'Near its recent average.' });
  }
  const cap = riskProfile === 'Conservative' ? 0.20 : riskProfile === 'Aggressive' ? 0.40 : 0.30;
  if (position.weight > cap) { score -= 2; factors.push({ name: 'Concentration', value: r2(position.weight), effect: 'negative', note: `More than ${Math.round(cap * 100)}% of your portfolio is in this one holding.` }); }
  else if (position.weight < 0.03) factors.push({ name: 'Concentration', value: r2(position.weight), effect: 'neutral', note: 'Small position — little portfolio impact either way.' });
  if (position.unrealisedPct > 0.5) factors.push({ name: 'Gain', value: r2(position.unrealisedPct), effect: 'neutral', note: 'Large unrealised gain — trimming would be taxable.' });
  const action = score >= 2 ? 'accumulate' : score <= -2 ? 'trim' : 'hold';
  const marketData = series.length >= 20;
  const confidence = (marketData ? 0.5 : 0.25) + Math.min(0.2, factors.length * 0.05);
  return {
    symbol: position.symbol, name: position.name, action, score, weight: r2(position.weight), factors,
    explain: explain({
      title: `${position.symbol}: ${action}`,
      verdict: action === 'hold' ? 'No strong reason to act.' : action === 'trim' ? 'Signals point to reducing this position.' : 'Signals point to adding to this position.',
      why: factors.filter(f => f.effect !== 'neutral').map(f => f.note),
      inputs: { rsi: rsiValue, weight: position.weight, unrealisedPct: position.unrealisedPct, priceHistoryPoints: series.length },
      risks: ['Technical signals are noisy and often wrong in the short run.', position.unrealisedPct > 0 ? 'Selling may trigger capital gains tax.' : 'Selling at a loss locks it in.'],
      alternatives: action === 'trim' ? ['Trim part rather than all.', 'Stop adding new money and let others catch up.'] : ['Stagger purchases over several months.', 'Do nothing — holding is a valid choice.'],
      confidence, uncertainty: marketData ? 'Based on available price history only; no fundamentals are considered.' : 'Limited price history — based on your own trade prices, so treat as low reliability.',
    }),
  };
}

// ── Insurance ────────────────────────────────────────────────────────
export const INSURANCE_KINDS = ['term', 'life', 'health', 'motor', 'home', 'other'];

export function insuranceAnalysis({ profile, policies, debt = 0, liquidAssets = 0 }) {
  const income = profile.annualIncome ?? 0;
  const sum = k => policies.filter(p => p.kind === k).reduce((s, p) => s + p.sumAssured, 0);
  const premium = policies.reduce((s, p) => s + p.annualPremium, 0);
  const life = sum('term') + sum('life'), health = sum('health');
  const multiple = (profile.age ?? 35) < 40 ? 15 : (profile.age ?? 35) < 50 ? 12 : 8;
  const lifeNeed = income ? Math.max(0, income * multiple + debt - liquidAssets * 0.5) : null;
  const healthNeed = 1000000 + 500000 * (profile.dependents ?? 0) + (profile.age >= 45 ? 500000 : 0);
  const gaps = [];
  if (lifeNeed != null) {
    if (life < lifeNeed) gaps.push({ kind: 'term', have: r2(life), need: r2(lifeNeed), gap: r2(lifeNeed - life), severity: life < lifeNeed * 0.5 ? 'high' : 'medium',
      explain: explain({ title: 'Life cover gap', verdict: `You are short by about ${r2(lifeNeed - life)}.`, why: [`Rule of thumb: ${multiple}× annual income plus outstanding debt, less half your liquid assets.`], inputs: { income, debt, liquidAssets, age: profile.age, existingCover: life }, risks: ['Rules of thumb ignore your exact family needs.'], alternatives: ['A pure term plan is usually the cheapest cover per rupee.', 'Staggered covers that step down as debts shrink.'], confidence: 0.55, uncertainty: 'A needs-based calculation with real family expenses would be more precise.' }) });
  } else gaps.push({ kind: 'term', need: null, note: 'Add your annual income to assess life cover.', severity: 'unknown' });
  if (health < healthNeed) gaps.push({ kind: 'health', have: r2(health), need: healthNeed, gap: r2(healthNeed - health), severity: health === 0 ? 'high' : 'medium',
    explain: explain({ title: 'Health cover gap', verdict: `Recommended health cover is at least ${healthNeed}.`, why: ['Medical inflation is well above general inflation.', 'Dependents increase the likelihood and size of claims.'], inputs: { dependents: profile.dependents, age: profile.age, existingCover: health }, risks: ['Employer cover usually ends with the job.'], alternatives: ['A family floater plus a super top-up is often cheaper than a large base cover.'], confidence: 0.6, uncertainty: 'City, hospital tier and pre-existing conditions change the right number.' }) });
  const ratio = income ? premium / income : null;
  return {
    totals: { life: r2(life), health: r2(health), annualPremium: r2(premium), premiumToIncome: ratio == null ? null : r2(ratio) },
    needs: { life: lifeNeed == null ? null : r2(lifeNeed), health: healthNeed }, gaps,
    overInsured: ratio != null && ratio > 0.15 ? 'Premiums exceed 15% of income — review for overlap or low-value savings plans.' : null,
  };
}

export function comparePolicies(policies) {
  return policies.map(p => ({
    id: p.id, name: p.name, insurer: p.insurer, kind: p.kind, sumAssured: p.sumAssured, annualPremium: p.annualPremium,
    premiumPerLakh: p.sumAssured ? r2(p.annualPremium / (p.sumAssured / 100000)) : null,
    yearsLeft: p.termYears ? Math.max(0, p.termYears - Math.floor(diffDays(new Date().toISOString().slice(0, 10), p.startDate) / 365)) : null,
  })).sort((a, b) => (a.premiumPerLakh ?? Infinity) - (b.premiumPerLakh ?? Infinity));
}
