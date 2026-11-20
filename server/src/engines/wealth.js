import { diffDays, parseDay } from '../lib/dates.js';

/** How each user-valued holding kind is grouped for allocation. */
export const KIND_GROUP = {
  fd: 'cash', gsec: 'bond', pf: 'bond', sgb: 'gold', silver: 'gold',
  reit: 'equity', esop: 'equity', real_estate: 'realEstate',
};
export const KIND_LABEL = {
  fd: 'Fixed deposit', pf: 'Provident Fund', sgb: 'Sovereign Gold Bond', gsec: 'Government security',
  silver: 'Silver', reit: 'REIT', real_estate: 'Real estate', esop: 'ESOPs',
};
/** Kinds counted as "liquid enough to fund an emergency" (everything else is long-lock or illiquid). */
export const LIQUID_KINDS = new Set(['fd', 'silver', 'sgb', 'gsec', 'reit']);
const years = (a, b) => Math.max(0, diffDays(b, a) / 365.25);

/** FD value with quarterly compounding, capped at maturity. */
export function fdValue(h, today) {
  const rate = Number(h.rate ?? 0) / 100;
  const end = h.maturity_date && h.maturity_date < today ? h.maturity_date : today;
  const t = years(String(h.start_date).slice(0, 10), String(end).slice(0, 10));
  return Number(h.invested) * Math.pow(1 + rate / 4, 4 * t);
}

export function fdMaturityValue(h) {
  if (!h.maturity_date) return null;
  const t = years(String(h.start_date).slice(0, 10), String(h.maturity_date).slice(0, 10));
  return Number(h.invested) * Math.pow(1 + Number(h.rate ?? 0) / 400, 4 * t);
}

export function holdingView(h, today) {
  const invested = Number(h.invested);
  const value = h.kind === 'fd' ? fdValue(h, today) : Number(h.current_value ?? invested);
  const start = String(h.start_date).slice(0, 10), mat = h.maturity_date ? String(h.maturity_date).slice(0, 10) : null;
  return {
    id: h.id, kind: h.kind, label: KIND_LABEL[h.kind], group: KIND_GROUP[h.kind], name: h.name,
    invested, value: Math.round(value * 100) / 100, gain: Math.round((value - invested) * 100) / 100,
    gainPct: invested ? (value - invested) / invested : 0,
    rate: h.rate == null ? null : Number(h.rate), annualIncome: h.annual_income == null ? null : Number(h.annual_income),
    startDate: start, maturityDate: mat,
    maturityValue: h.kind === 'fd' ? fdMaturityValue(h) : null,
    daysToMaturity: mat ? diffDays(mat, today) : null,
    matured: mat ? mat <= today : false,
    note: h.note ?? null, liquid: LIQUID_KINDS.has(h.kind),
  };
}

// ── Loans ────────────────────────────────────────────────────────────
const CAP = 600;

/** Month-by-month simulation of a single loan. */
export function loanProjection({ outstanding, rate, emi }, extra = 0) {
  const i = rate / 1200;
  let bal = outstanding, months = 0, interest = 0;
  const pay = emi + extra;
  if (bal <= 0) return { months: 0, totalInterest: 0, payoffPossible: true };
  if (pay <= bal * i + 1e-9) return { months: Infinity, totalInterest: Infinity, payoffPossible: false };
  while (bal > 0.005 && months < CAP) {
    const int = bal * i;
    const p = Math.min(pay, bal + int);
    bal = bal + int - p; interest += int; months++;
  }
  return { months, totalInterest: Math.round(interest * 100) / 100, payoffPossible: bal <= 0.005 };
}

export function loanView(l, today) {
  const base = loanProjection({ outstanding: Number(l.outstanding), rate: Number(l.rate), emi: Number(l.emi) });
  const monthlyInterest = Number(l.outstanding) * Number(l.rate) / 1200;
  const high = Number(l.rate) >= 15;
  const advice = !base.payoffPossible
    ? 'Your EMI does not cover the monthly interest, so this balance will never shrink. Raise the EMI or restructure.'
    : high ? 'High-interest debt. Paying this off early usually beats almost any investment return.' : null;
  const tenFifth = loanProjection({ outstanding: Number(l.outstanding), rate: Number(l.rate), emi: Number(l.emi) }, Number(l.emi) * 0.1);
  return {
    id: l.id, kind: l.kind, name: l.name, outstanding: Number(l.outstanding), rate: Number(l.rate), emi: Number(l.emi),
    monthsLeft: base.payoffPossible ? base.months : null, totalInterestLeft: base.payoffPossible ? base.totalInterest : null,
    monthlyInterest: Math.round(monthlyInterest * 100) / 100,
    interestShareOfEmi: Number(l.emi) ? monthlyInterest / Number(l.emi) : null,
    highInterest: high, advice,
    prepay10: base.payoffPossible && tenFifth.payoffPossible
      ? { extraPerMonth: Math.round(Number(l.emi) * 10) / 100, interestSaved: Math.round((base.totalInterest - tenFifth.totalInterest) * 100) / 100, monthsSaved: base.months - tenFifth.months } : null,
  };
}

/** Debt-avalanche plan: all EMIs plus `extra` go to the highest-rate loan; freed EMIs roll over. */
export function avalanchePlan(loans, extra = 0, strategy = 'avalanche') {
  const ls = loans.map(l => ({ id: l.id, name: l.name, bal: Number(l.outstanding), rate: Number(l.rate), emi: Number(l.emi) })).filter(l => l.bal > 0);
  const baseline = ls.map(l => loanProjection({ outstanding: l.bal, rate: l.rate, emi: l.emi }));
  const baselineInterest = baseline.reduce((s, b) => s + (Number.isFinite(b.totalInterest) ? b.totalInterest : 0), 0);
  const baselineMonths = Math.max(0, ...baseline.map(b => (Number.isFinite(b.months) ? b.months : 0)));
  const budget = ls.reduce((s, l) => s + l.emi, 0) + extra;
  const order = [];
  let months = 0, interest = 0;
  const live = ls.map(l => ({ ...l }));
  while (live.some(l => l.bal > 0.005) && months < CAP) {
    months++;
    let left = budget;
    for (const l of live) {                       // accrue interest and pay minimums
      if (l.bal <= 0.005) continue;
      const int = l.bal * l.rate / 1200; interest += int; l.bal += int;
      const p = Math.min(l.emi, l.bal); l.bal -= p; left -= p;
    }
    for (const l of [...live].filter(x => x.bal > 0.005).sort((a, b) => (strategy === 'snowball' ? a.bal - b.bal : b.rate - a.rate))) {
      if (left <= 0) break;
      const p = Math.min(left, l.bal); l.bal -= p; left -= p;
    }
    for (const l of live) if (l.bal <= 0.005 && l.bal > -1 && !order.find(o => o.id === l.id)) { l.bal = 0; order.push({ id: l.id, name: l.name, month: months }); }
  }
  const finished = !live.some(l => l.bal > 0.005);
  return {
    strategy, extraPerMonth: extra, payoffOrder: order, monthsToDebtFree: finished ? months : null,
    totalInterest: Math.round(interest * 100) / 100,
    baseline: { monthsToDebtFree: baselineMonths || null, totalInterest: Math.round(baselineInterest * 100) / 100 },
    interestSaved: finished ? Math.round((baselineInterest - interest) * 100) / 100 : null,
    monthsSaved: finished && baselineMonths ? baselineMonths - months : null,
  };
}

// ── Net worth ────────────────────────────────────────────────────────
/**
 * @param market   { totals:{value}, allocation:[{assetClass,value}] } from the trading ledger
 * @param holdings holdingView[]
 * @param loans    loanView[]
 */
export function computeNetWorth({ market, holdings, loans, profile }) {
  const marketValue = market?.totals?.value ?? 0;
  const manualValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalAssets = marketValue + manualValue;
  const totalDebt = loans.reduce((s, l) => s + l.outstanding, 0);
  const groups = {};
  (market?.allocation ?? []).forEach(a => { groups[a.assetClass] = (groups[a.assetClass] ?? 0) + a.value; });
  holdings.forEach(h => { groups[h.group] = (groups[h.group] ?? 0) + h.value; });
  const allocation = Object.entries(groups).map(([group, value]) => ({ group, value, weight: totalAssets ? value / totalAssets : 0 })).sort((a, b) => b.value - a.value);
  const monthlyEmi = loans.reduce((s, l) => s + l.emi, 0);
  const income = Number(profile?.annual_income ?? 0);
  const liquid = (market?.allocation ?? []).filter(a => a.assetClass !== 'crypto').reduce((s, a) => s + a.value, 0)
    + holdings.filter(h => h.liquid).reduce((s, h) => s + h.value, 0);
  return {
    marketValue, manualValue, totalAssets, totalDebt, netWorth: totalAssets - totalDebt,
    debtToAsset: totalAssets ? totalDebt / totalAssets : null,
    debtServiceRatio: income ? (monthlyEmi * 12) / income : null,
    monthlyEmi, liquidAssets: liquid, allocation,
    byKind: holdings.reduce((o, h) => { o[h.kind] = (o[h.kind] ?? 0) + h.value; return o; }, {}),
    passiveIncome: holdings.reduce((s, h) => s + (h.annualIncome ?? 0), 0),
  };
}

export { parseDay };
