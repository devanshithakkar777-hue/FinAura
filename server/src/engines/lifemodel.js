import { EXPECTED_RETURN } from './planning.js';

/**
 * Whole-life financial model (the Predictive Digital Twin core).
 * Monthly Monte-Carlo of income, expenses, debts, cash buffer, a market portfolio and property,
 * through retirement to life expectancy. Pure and deterministic for a given seed.
 * Common random numbers: every scenario sees the same market paths, so differences come from the decision alone.
 */
export const LIFE_EXPECTANCY = 85;
export const ASSUMPTIONS = { incomeGrowth: 0.07, inflation: 0.06, cashReturn: 0.04, propertyGrowth: 0.06, taxRate: 0.12, homePurchaseCost: 0.06 };
const SIGMA = { equity: 0.18, mutualFund: 0.14, crypto: 0.70, bond: 0.05, gold: 0.15, cash: 0.005, realEstate: 0 };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
const emiFor = (P, rate, years) => { const i = rate / 1200, n = Math.round(years * 12); return i ? P * i / (1 - Math.pow(1 + i, -n)) : P / n; };

/** Portfolio return/volatility from allocation groups (cash and property are modelled separately). */
export function portfolioParams(allocation) {
  const rows = allocation.filter(a => a.group !== 'cash' && a.group !== 'realEstate' && a.value > 0);
  const tot = rows.reduce((s, a) => s + a.value, 0);
  if (!tot) return { mu: 0.09, sigma: 0.14 };
  const mu = rows.reduce((s, a) => s + (EXPECTED_RETURN[a.group] ?? 0.08) * a.value / tot, 0);
  const ws = rows.map(a => (SIGMA[a.group] ?? 0.15) * a.value / tot);
  const sigma = Math.sqrt(0.7 * ws.reduce((s, x) => s + x, 0) ** 2 + 0.3 * ws.reduce((s, x) => s + x * x, 0));
  return { mu, sigma };
}

/** Turn loaded wealth state into a life-model state, noting what had to be assumed. */
export function lifeStateFrom(s) {
  const p = s.profile, assumed = [];
  const need = (k, v, label) => { if (p[k] == null || p[k] === 0) assumed.push(label); return p[k] || v; };
  const age = need('age', 30, 'age (30)'), retirementAge = need('retirementAge', 60, 'retirement age (60)');
  const annualIncome = p.annualIncome ?? 0; if (!annualIncome) assumed.push('income (none entered)');
  const monthlyExpenses = need('monthlyExpenses', 0, 'monthly expenses (none entered)');
  const grp = g => s.nw.allocation.find(a => a.group === g)?.value ?? 0;
  const cash = grp('cash'), realEstate = grp('realEstate');
  const portfolio = Math.max(0, s.nw.totalAssets - cash - realEstate);
  const { mu, sigma } = portfolioParams(s.nw.allocation);
  return {
    age, retirementAge, annualIncome, monthlyExpenses, cash, portfolio, property: realEstate, mu, sigma,
    debts: s.loans.map(l => ({ name: l.name, outstanding: l.outstanding, rate: l.rate, emi: l.emi })),
    assumed,
  };
}

/**
 * @param state  from lifeStateFrom
 * @param events [{type, atMonth, ...}] see EVENT_TYPES
 * @param opts   { paths, seed, taxRate }
 */
export function simulateLife(state, events = [], opts = {}) {
  const { paths = 300, seed = 1, taxRate = ASSUMPTIONS.taxRate } = opts;
  const A = ASSUMPTIONS;
  const horizon = Math.min(65, Math.max(1, LIFE_EXPECTANCY - state.age));
  const months = horizon * 12;
  const evs = [...events].sort((a, b) => a.atMonth - b.atMonth);
  const retireOverride = evs.find(e => e.type === 'retire_at');
  const retireMonth = Math.max(0, ((retireOverride ? retireOverride.age : state.retirementAge) - state.age) * 12);
  const mCash = Math.pow(1 + A.cashReturn, 1 / 12) - 1, mProp = Math.pow(1 + A.propertyGrowth, 1 / 12) - 1;

  const yearly = Array.from({ length: horizon + 1 }, () => []);
  const liquidAtRetire = [], finals = [], minLiquids = [];
  let failed = 0, cashShort = 0;
  const failAges = [];

  for (let p = 0; p < paths; p++) {
    const rand = mulberry32(seed * 100003 + p * 7919 + 17);
    let portfolio = state.portfolio, cash = state.cash, property = state.property;
    let income = state.annualIncome / 12 * (1 - taxRate), expenses = state.monthlyExpenses;
    const debts = state.debts.map(d => ({ bal: d.outstanding, i: d.rate / 1200, emi: d.emi }));
    let jobLossUntil = -1, sipExtra = 0, sipUntil = -1, recoveryPerMonth = 0, recoveryUntil = -1, failedAt = -1, minLiquid = portfolio + cash, shortfall = false;
    let evIdx = 0;
    yearly[0].push(portfolio + cash + property - debts.reduce((s, d) => s + d.bal, 0));

    for (let m = 1; m <= months; m++) {
      const z = gauss(rand);                       // drawn every month → identical market paths across scenarios
      const r = (state.mu - 0.5 * state.sigma ** 2) / 12 + (state.sigma / Math.sqrt(12)) * z;
      portfolio *= Math.exp(r); if (m <= recoveryUntil) portfolio += recoveryPerMonth; cash *= 1 + mCash; property *= 1 + mProp;
      if (m % 12 === 0) { expenses *= 1 + A.inflation; if (m < retireMonth) income *= 1 + A.incomeGrowth; }

      while (evIdx < evs.length && evs[evIdx].atMonth <= m) {
        const e = evs[evIdx++];
        if (e.type === 'job_loss') jobLossUntil = m + e.months;
        else if (e.type === 'income_change') income *= 1 + e.pct;
        else if (e.type === 'expense_change') expenses *= 1 + e.pct;
        else if (e.type === 'one_time') cash += e.amount;
        else if (e.type === 'invest_monthly') { sipExtra = e.amount; sipUntil = e.until ?? months; }
        else if (e.type === 'market_crash') { const lost = portfolio * -e.shock; portfolio -= lost; recoveryUntil = m + (e.recoveryMonths ?? 24); recoveryPerMonth = lost * 0.9 / (e.recoveryMonths ?? 24); }  // restores 90% of the lost value, never the lost compounding
        else if (e.type === 'prepay') { const d = [...debts].sort((a, b) => b.i - a.i).find(x => x.bal > 0); if (d) { const amt = Math.min(e.amount, d.bal); d.bal -= amt; cash -= amt; } }
        else if (e.type === 'purchase_home') {
          const down = e.price * e.downPct + e.price * A.homePurchaseCost, loan = e.price * (1 - e.downPct);
          cash -= down; property += e.price;
          debts.push({ bal: loan, i: e.rate / 1200, emi: emiFor(loan, e.rate, e.years) });
          expenses = Math.max(0, expenses - (e.rentSaved ?? 0));
        }
      }

      let flow = -expenses;
      if (m <= retireMonth && m > jobLossUntil) flow += income;
      for (const d of debts) {
        if (d.bal <= 0.005) continue;
        const interest = d.bal * d.i, pay = Math.min(d.emi, d.bal + interest);
        d.bal = Math.max(0, d.bal + interest - pay); flow -= pay;
      }
      const sip = m <= sipUntil ? sipExtra : 0;
      if (flow >= 0) {
        const target = 6 * (expenses + debts.reduce((s, d) => s + (d.bal > 0 ? d.emi : 0), 0));
        const toCash = Math.min(flow, Math.max(0, target - cash));
        cash += toCash; portfolio += flow - toCash;
      } else {
        cash += flow;                              // draw down cash first
        if (cash < 0) { if (m <= retireMonth) shortfall = true; portfolio += cash; cash = 0; }
      }
      if (sip) { const move = Math.min(sip, cash + Math.max(0, portfolio)); cash -= Math.min(cash, move); portfolio += move; }
      if (portfolio < 0) { portfolio = 0; if (failedAt < 0 && m > 0) failedAt = m; }
      minLiquid = Math.min(minLiquid, portfolio + cash);
      if (m === retireMonth) liquidAtRetire.push(portfolio + cash);
      if (m % 12 === 0) yearly[m / 12].push(portfolio + cash + property - debts.reduce((s, d) => s + d.bal, 0));
    }
    if (retireMonth === 0) liquidAtRetire.push(state.portfolio + state.cash);
    finals.push(yearly[horizon][p]); minLiquids.push(minLiquid);
    if (failedAt >= 0) { failed++; failAges.push(state.age + failedAt / 12); }
    if (shortfall) cashShort++;
  }
  const sorted = a => [...a].sort((x, y) => x - y);
  const bands = yearly.map((col, y) => { const s = sorted(col); return { year: y, age: state.age + y, p10: Math.round(pct(s, 0.1)), p50: Math.round(pct(s, 0.5)), p90: Math.round(pct(s, 0.9)) }; });
  const fa = sorted(failAges);
  return {
    paths, horizonYears: horizon, retirementAge: retireOverride ? retireOverride.age : state.retirementAge, bands,
    finalNetWorth: { p10: bands.at(-1).p10, p50: bands.at(-1).p50, p90: bands.at(-1).p90 },
    liquidAtRetirement: Math.round(pct(sorted(liquidAtRetire), 0.5)),
    probabilityFundsLast: Math.floor((1 - failed / paths) * 100) / 100,
    medianDepletionAge: fa.length ? Math.round(pct(fa, 0.5) * 10) / 10 : null,
    probabilityCashShortfall: Math.round(cashShort / paths * 100) / 100,
    worstLiquidP10: Math.round(pct(sorted(minLiquids), 0.1)),
  };
}

export const EVENT_TYPES = ['job_loss', 'income_change', 'expense_change', 'one_time', 'invest_monthly', 'market_crash', 'prepay', 'purchase_home', 'retire_at'];
export { emiFor, mulberry32 };
