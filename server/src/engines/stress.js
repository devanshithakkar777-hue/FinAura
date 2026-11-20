import { explain } from '../lib/explain.js';

/** Instant shocks by asset group (fractions). Illustrative scenarios built from broad historical episodes, not predictions. */
export const STRESS = {
  equity_crash: { label: 'Equity crash (2008 / 2020 style)', shocks: { equity: -0.35, mutualFund: -0.30, crypto: -0.60, gold: 0.08, bond: 0.02, cash: 0, realEstate: -0.05 }, incomeHit: 0 },
  inflation_spike: { label: 'Inflation spike (+4 points for 2 years)', shocks: { equity: -0.10, mutualFund: -0.09, crypto: -0.15, gold: 0.12, bond: -0.08, cash: -0.08, realEstate: 0.03 }, incomeHit: 0, expenseRise: 0.08 },
  rate_hike: { label: 'Sharp interest-rate rise (+2 points)', shocks: { equity: -0.12, mutualFund: -0.10, crypto: -0.25, gold: -0.04, bond: -0.08, cash: 0.01, realEstate: -0.06 }, incomeHit: 0, emiRise: 0.12 },
  recession: { label: 'Recession with job risk', shocks: { equity: -0.30, mutualFund: -0.26, crypto: -0.50, gold: 0.06, bond: 0.03, cash: 0, realEstate: -0.10 }, incomeHit: 0.25 },
  stagflation: { label: 'Stagflation', shocks: { equity: -0.22, mutualFund: -0.20, crypto: -0.40, gold: 0.15, bond: -0.10, cash: -0.06, realEstate: -0.04 }, incomeHit: 0.10, expenseRise: 0.10 },
  crypto_winter: { label: 'Crypto winter', shocks: { equity: -0.05, mutualFund: -0.04, crypto: -0.75, gold: 0, bond: 0, cash: 0, realEstate: 0 }, incomeHit: 0 },
};

export const stressCatalog = () => Object.entries(STRESS).map(([key, s]) => ({ key, label: s.label }));

/**
 * @param nw      computeNetWorth() result (allocation by group, totals, debt, emi)
 * @param profile {annualIncome, monthlyExpenses}
 * @param custom  optional group → shock overrides
 */
export function stressTest(nw, profile = {}, which = Object.keys(STRESS), custom = null) {
  const alloc = Object.fromEntries(nw.allocation.map(a => [a.group, a.value]));
  const incomeM = (profile.annualIncome ?? 0) / 12 * 0.88, expM = profile.monthlyExpenses ?? 0;
  const keys = custom ? ['custom'] : which;
  const rows = keys.map(key => {
    const sc = key === 'custom' ? { label: 'Your custom shock', shocks: custom, incomeHit: 0 } : STRESS[key];
    const after = {}; let loss = 0;
    for (const [g, v] of Object.entries(alloc)) { const sh = sc.shocks[g] ?? 0; after[g] = { before: Math.round(v), after: Math.round(v * (1 + sh)), shock: sh }; loss += v * sh; }
    const assetsAfter = nw.totalAssets + loss;
    const emi = nw.monthlyEmi * (1 + (sc.emiRise ?? 0));
    const outflow = expM * (1 + (sc.expenseRise ?? 0)) + emi, inflow = incomeM * (1 - (sc.incomeHit ?? 0));
    const cashAfter = after.cash?.after ?? 0;
    const monthlyGap = outflow - inflow;
    const runwayMonths = monthlyGap > 0 ? cashAfter / monthlyGap : null;
    const worst = Object.entries(after).sort((a, b) => a[1].after - a[1].before - (b[1].after - b[1].before))[0];
    const lossPct = nw.totalAssets ? loss / nw.totalAssets : 0;
    return {
      key, label: sc.label, assetsBefore: Math.round(nw.totalAssets), assetsAfter: Math.round(assetsAfter), loss: Math.round(loss), lossPct: Math.round(lossPct * 1000) / 1000,
      netWorthAfter: Math.round(assetsAfter - nw.totalDebt), groups: after, monthlyGap: Math.round(monthlyGap), runwayMonths: runwayMonths == null ? null : Math.round(runwayMonths * 10) / 10,
      severity: lossPct < -0.25 ? 'severe' : lossPct < -0.12 ? 'high' : lossPct < -0.05 ? 'moderate' : 'mild',
      explain: explain({
        title: sc.label, verdict: `Your assets would move by ${Math.round(lossPct * 100)}% in this scenario.`,
        why: [worst && worst[1].shock < 0 ? `${worst[0]} takes the biggest hit (${Math.round(worst[1].shock * 100)}%).` : 'No group falls sharply.', monthlyGap > 0 ? `Income would no longer cover outgoings; the gap is about ${Math.round(monthlyGap).toLocaleString('en-IN')}/month.` : 'Your income would still cover outgoings.'],
        inputs: { allocation: alloc, monthlyEmi: nw.monthlyEmi, monthlyExpenses: expM },
        risks: ['Shocks are broad historical analogues; real crises differ in size, speed and duration.', 'Correlations tend to rise in crises, so diversification helps less than usual.'],
        alternatives: ['Hold 6–12 months of expenses in cash-like assets.', 'Cap the weight of any single volatile asset.', 'Review insurance and income protection.'],
        confidence: 0.55, uncertainty: 'This shows one possible shape of stress, not the likelihood of it happening.',
      }),
    };
  });
  rows.sort((a, b) => a.loss - b.loss);
  return { totalAssets: Math.round(nw.totalAssets), totalDebt: Math.round(nw.totalDebt), scenarios: rows, worst: rows[0] ?? null };
}
