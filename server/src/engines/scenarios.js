import { simulateLife, emiFor, LIFE_EXPECTANCY } from './lifemodel.js';
import { explain } from '../lib/explain.js';

const num = (v, lo, hi, d) => { const n = Number(v ?? d); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** Catalogue of what-if decisions. `build` turns user params into model events. */
export const CATALOG = {
  job_loss:      { label: 'Lose my job', params: { months: [1, 36, 9], atMonths: [1, 600, 6] },
    build: (p, st) => [{ type: 'job_loss', atMonth: num(p.atMonths, 1, 600, 6), months: num(p.months, 1, 36, 9) }], title: p => `Lose my job for ${num(p.months, 1, 36, 9)} months` },
  buy_home:      { label: 'Buy a house', params: { price: [1e5, 1e9, 8e6], downPct: [0.05, 0.9, 0.2], rate: [3, 20, 8.75], years: [3, 30, 20], atMonths: [1, 600, 12], rentSaved: [0, 1e6, 0] },
    build: p => [{ type: 'purchase_home', atMonth: num(p.atMonths, 1, 600, 12), price: num(p.price, 1e5, 1e9, 8e6), downPct: num(p.downPct, 0.05, 0.9, 0.2), rate: num(p.rate, 3, 20, 8.75), years: num(p.years, 3, 30, 20), rentSaved: num(p.rentSaved, 0, 1e6, 0) }],
    title: p => `Buy a ${Math.round(num(p.price, 1e5, 1e9, 8e6)).toLocaleString('en-IN')} home` },
  invest_monthly:{ label: 'Invest more every month', params: { amount: [100, 1e7, 20000] },
    build: p => [{ type: 'invest_monthly', atMonth: 1, amount: num(p.amount, 100, 1e7, 20000) }], title: p => `Invest ${Math.round(num(p.amount, 100, 1e7, 20000)).toLocaleString('en-IN')} more every month` },
  market_fall:   { label: 'Markets fall', params: { drop: [0.05, 0.7, 0.3], atMonths: [1, 600, 12] },
    build: p => [{ type: 'market_crash', atMonth: num(p.atMonths, 1, 600, 12), shock: -num(p.drop, 0.05, 0.7, 0.3), recoveryMonths: 24 }], title: p => `Markets fall ${Math.round(num(p.drop, 0.05, 0.7, 0.3) * 100)}%` },
  retire_early:  { label: 'Change retirement age', params: { age: [35, 80, 55] },
    build: p => [{ type: 'retire_at', atMonth: 0, age: num(p.age, 35, 80, 55) }], title: p => `Retire at ${num(p.age, 35, 80, 55)}` },
  income_change: { label: 'Income changes', params: { pct: [-0.7, 2, 0.2], atMonths: [1, 600, 12] },
    build: p => [{ type: 'income_change', atMonth: num(p.atMonths, 1, 600, 12), pct: num(p.pct, -0.7, 2, 0.2) }], title: p => `Income ${num(p.pct, -0.7, 2, 0.2) >= 0 ? 'rises' : 'falls'} ${Math.round(Math.abs(num(p.pct, -0.7, 2, 0.2)) * 100)}%` },
  expense_change:{ label: 'Spending changes', params: { pct: [-0.5, 1, 0.1], atMonths: [1, 600, 1] },
    build: p => [{ type: 'expense_change', atMonth: num(p.atMonths, 1, 600, 1), pct: num(p.pct, -0.5, 1, 0.1) }], title: p => `Expenses ${num(p.pct, -0.5, 1, 0.1) >= 0 ? 'rise' : 'fall'} ${Math.round(Math.abs(num(p.pct, -0.5, 1, 0.1)) * 100)}%` },
  windfall:      { label: 'One-time expense or windfall', params: { amount: [-1e9, 1e9, -500000], atMonths: [1, 600, 6] },
    build: p => [{ type: 'one_time', atMonth: num(p.atMonths, 1, 600, 6), amount: num(p.amount, -1e9, 1e9, -500000) }], title: p => `${num(p.amount, -1e9, 1e9, -500000) < 0 ? 'Spend' : 'Receive'} ${Math.round(Math.abs(num(p.amount, -1e9, 1e9, -500000))).toLocaleString('en-IN')} once` },
  prepay_debt:   { label: 'Prepay a loan', params: { amount: [1000, 1e9, 500000], atMonths: [1, 600, 6] },
    build: p => [{ type: 'prepay', atMonth: num(p.atMonths, 1, 600, 6), amount: num(p.amount, 1000, 1e9, 500000) }], title: p => `Prepay ${Math.round(num(p.amount, 1000, 1e9, 500000)).toLocaleString('en-IN')} of debt` },
};

export const catalogView = () => Object.entries(CATALOG).map(([kind, c]) => ({
  kind, label: c.label, params: Object.entries(c.params).map(([name, [min, max, def]]) => ({ name, min, max, default: def })),
}));

const fmt = n => Math.round(n).toLocaleString('en-IN');

/** Compare decisions to the baseline on identical market paths. */
export function compareScenarios(state, picks, opts = {}) {
  const base = simulateLife(state, [], opts);
  const results = picks.map(({ kind, params = {} }) => {
    const c = CATALOG[kind];
    const events = c.build(params, state);
    const run = simulateLife(state, events, opts);
    const d = {
      finalNetWorthMedian: run.finalNetWorth.p50 - base.finalNetWorth.p50,
      liquidAtRetirement: run.liquidAtRetirement - base.liquidAtRetirement,
      probabilityFundsLast: Math.round((run.probabilityFundsLast - base.probabilityFundsLast) * 100) / 100,
      probabilityCashShortfall: Math.round((run.probabilityCashShortfall - base.probabilityCashShortfall) * 100) / 100,
    };
    const worse = d.probabilityFundsLast < -0.05 || d.finalNetWorthMedian < -0.2 * Math.abs(base.finalNetWorth.p50);
    const better = d.probabilityFundsLast > 0.03 || d.finalNetWorthMedian > 0.1 * Math.abs(base.finalNetWorth.p50);
    const verdict = worse ? 'weakens your plan' : better ? 'strengthens your plan' : 'has a modest effect on your plan';
    const why = [
      `Median net worth at ${LIFE_EXPECTANCY} moves by ${d.finalNetWorthMedian >= 0 ? '+' : '−'}${fmt(Math.abs(d.finalNetWorthMedian))}.`,
      `Chance your money lasts to ${LIFE_EXPECTANCY}: ${Math.round(run.probabilityFundsLast * 100)}% (was ${Math.round(base.probabilityFundsLast * 100)}%).`,
    ];
    if (run.probabilityCashShortfall > base.probabilityCashShortfall + 0.05) why.push('You would be more likely to have to sell investments to cover bills before retiring.');
    const risks = ['Models use fixed return and inflation assumptions; real life will differ.'];
    if (kind === 'buy_home') risks.push('Maintenance, property tax and price changes are not modelled; the price is assumed to grow 6% a year.');
    if (kind === 'market_fall') risks.push('The timing of a fall matters more than its size when you are close to retirement.', 'Assumes 90% of the lost value comes back over two years but never the growth missed meanwhile.');
    if (kind === 'job_loss') risks.push('Severance, notice pay and unemployment cover are not included.');
    const alternatives = { job_loss: ['Build a bigger cash buffer first.', 'Check income-protection or critical-illness cover.'], buy_home: ['Raise the down payment to cut the EMI.', 'Delay the purchase and let the portfolio compound.'], invest_monthly: ['Step the amount up gradually as income grows.'], market_fall: ['Keep 2–3 years of expenses in cash and debt before retirement.', 'Rebalance on a schedule rather than react.'], retire_early: ['Work part-time for a few years.', 'Raise the monthly investment instead.'], income_change: ['Re-run with a different timing.'], expense_change: ['Test a smaller change to find your break-even.'], windfall: ['Spread a big expense across months.'], prepay_debt: ['Compare the loan rate with your expected investment return.'] }[kind] ?? [];
    return {
      kind, title: c.title(params), params, events, result: run, delta: d, verdict,
      explain: explain({ title: c.title(params), verdict: `This ${verdict}.`, why, inputs: { age: state.age, retirementAge: state.retirementAge, assumed: state.assumed }, risks, alternatives,
        confidence: state.assumed.length > 2 ? 0.3 : state.assumed.length ? 0.45 : 0.6,
        uncertainty: state.assumed.length ? `Some inputs were assumed: ${state.assumed.join(', ')}. Add them in your profile for a sharper result.` : 'The range of plausible outcomes is wide; compare the 10th–90th percentile bands, not just the middle.' }),
    };
  });
  return { baseline: base, scenarios: results };
}

/** Which small, realistic changes move retirement readiness most. */
export function levers(state, opts = {}) {
  const runs = [
    ['Retire 2 years later', [{ type: 'retire_at', atMonth: 0, age: state.retirementAge + 2 }]],
    ['Invest 10% of income more', [{ type: 'invest_monthly', atMonth: 1, amount: Math.round(state.annualIncome / 12 * 0.1) }]],
    ['Spend 10% less', [{ type: 'expense_change', atMonth: 1, pct: -0.1 }]],
    ['Retire 3 years earlier', [{ type: 'retire_at', atMonth: 0, age: Math.max(35, state.retirementAge - 3) }]],
  ];
  const base = simulateLife(state, [], opts);
  return runs.map(([label, events]) => {
    const r = simulateLife(state, events, opts);
    return { label, probabilityFundsLast: r.probabilityFundsLast, delta: Math.round((r.probabilityFundsLast - base.probabilityFundsLast) * 100) / 100, finalNetWorthMedian: r.finalNetWorth.p50 };
  }).sort((a, b) => b.delta - a.delta);
}

export { emiFor };
