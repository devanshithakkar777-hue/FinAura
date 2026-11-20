import { avalanchePlan, loanProjection } from './wealth.js';
import { emiFor } from './lifemodel.js';
import { explain } from '../lib/explain.js';

const r0 = n => Math.round(n), r2 = n => Math.round(n * 100) / 100;
export const TAKE_HOME = 0.88;                 // assumed take-home share of gross income
export const scoreBand = s => (s >= 750 ? 'excellent' : s >= 700 ? 'good' : s >= 650 ? 'fair' : 'poor');
export const pvOfEmi = (emi, rate, years) => { const i = rate / 1200, n = Math.round(years * 12); return i ? emi * (1 - Math.pow(1 + i, -n)) / i : emi * n; };

/** Credit health from the user's own entries (no bureau connection). */
export function creditHealth({ profile, scores = [], monthlyEmi = 0, annualIncome = 0 }) {
  const out = { scoreBand: null, latestScore: null, scoreTrend: null, utilisation: null, utilisationStatus: null, debtToIncome: null, dtiStatus: null, factors: [], tips: [] };
  const last = scores.at(-1);
  if (last) {
    out.latestScore = last.score; out.scoreBand = scoreBand(last.score);
    if (scores.length > 1) out.scoreTrend = last.score - scores[0].score;
  }
  if (profile?.totalLimit > 0 && profile.utilised != null) {
    out.utilisation = r2(profile.utilised / profile.totalLimit);
    out.utilisationStatus = out.utilisation <= 0.3 ? 'good' : out.utilisation <= 0.5 ? 'moderate' : 'high';
    if (out.utilisation > 0.3) out.tips.push({ tip: `Bring card utilisation under 30% — that means paying about ${r0(profile.utilised - 0.3 * profile.totalLimit).toLocaleString('en-IN')} down.`, impact: 'high' });
  }
  const income = annualIncome / 12;
  if (income > 0) {
    out.debtToIncome = r2(monthlyEmi / income); out.dtiStatus = out.debtToIncome <= 0.3 ? 'healthy' : out.debtToIncome <= 0.45 ? 'stretched' : 'high';
    if (out.debtToIncome > 0.4) out.tips.push({ tip: 'EMIs take over 40% of gross income, which most lenders treat as a limit on new credit.', impact: 'high' });
  }
  if (profile?.missedPayments12m > 0) out.tips.push({ tip: `${profile.missedPayments12m} missed payment(s) in the last year weigh on the score. Set auto-debit for at least the minimum due.`, impact: 'high' });
  if (profile?.enquiries6m >= 4) out.tips.push({ tip: 'Many recent credit enquiries; avoid new applications for a few months.', impact: 'medium' });
  if (profile?.oldestAccountYears != null && profile.oldestAccountYears < 2) out.tips.push({ tip: 'A short credit history lifts with time; keep your oldest account open.', impact: 'low' });
  out.factors = [
    { name: 'Payment history', status: profile?.missedPayments12m ? 'negative' : profile ? 'positive' : 'unknown' },
    { name: 'Credit utilisation', status: out.utilisationStatus === 'good' ? 'positive' : out.utilisationStatus ? 'negative' : 'unknown' },
    { name: 'Enquiries', status: profile?.enquiries6m == null ? 'unknown' : profile.enquiries6m >= 4 ? 'negative' : 'positive' },
    { name: 'Account age', status: profile?.oldestAccountYears == null ? 'unknown' : profile.oldestAccountYears >= 5 ? 'positive' : 'neutral' },
  ];
  out.explain = explain({
    title: 'Credit health', verdict: out.latestScore ? `Your latest score of ${out.latestScore} is ${out.scoreBand}.` : 'Add a score to track your credit health.',
    why: [out.utilisation != null ? `You use ${Math.round(out.utilisation * 100)}% of your credit limit.` : 'Card limit and usage not entered.', out.debtToIncome != null ? `EMIs are ${Math.round(out.debtToIncome * 100)}% of your gross monthly income.` : 'Income not entered.'],
    inputs: { score: out.latestScore, utilisation: out.utilisation, debtToIncome: out.debtToIncome, missed: profile?.missedPayments12m, enquiries: profile?.enquiries6m },
    risks: ['Scores come from your own entries; FinAura is not connected to a credit bureau.', 'Different bureaus score differently.'], alternatives: ['Request your free annual report from each bureau and enter it here.'],
    confidence: out.latestScore && profile ? 0.7 : 0.35, uncertainty: 'Based on figures you typed in, which may be out of date.',
  });
  return out;
}

/** How much can be borrowed, using a fixed-obligation-to-income ratio. */
export function loanAffordability({ annualIncome, existingEmi = 0, rate, years, foir = 0.45 }) {
  if (!(annualIncome > 0)) return { ready: false, missing: ['annual income'] };
  const takeHome = annualIncome / 12 * TAKE_HOME;
  const calc = f => { const room = Math.max(0, takeHome * f - existingEmi); return { foir: f, maxEmi: r0(room), maxLoan: r0(pvOfEmi(room, rate, years)) }; };
  const comfortable = calc(0.35), stretch = calc(Math.min(0.6, foir));
  return {
    ready: true, assumptions: { takeHomeShare: TAKE_HOME, takeHomeMonthly: r0(takeHome), rate, years, existingEmi }, comfortable, stretch,
    explain: explain({
      title: 'Loan affordability', verdict: `A comfortable loan is about ${comfortable.maxLoan.toLocaleString('en-IN')}; most lenders might stretch to ${stretch.maxLoan.toLocaleString('en-IN')}.`,
      why: [`Take-home is estimated at ${r0(takeHome).toLocaleString('en-IN')}/month (${TAKE_HOME * 100}% of gross).`, `Existing EMIs of ${r0(existingEmi).toLocaleString('en-IN')} reduce the room.`],
      inputs: { annualIncome, existingEmi, rate, years }, risks: ['Lenders also look at credit score, age, job stability and property value.', 'A floating rate can rise and lift your EMI.'], alternatives: ['Choose a longer tenure only if you plan to prepay.', 'Increase the down payment.'],
      confidence: 0.55, uncertainty: 'Lender policies vary; this is a guide, not an approval.',
    }),
  };
}

export function emiOptions({ principal, rate, tenures = [5, 10, 15, 20, 25, 30], takeHome = null }) {
  const rows = tenures.map(y => { const emi = emiFor(principal, rate, y), total = emi * y * 12; return { years: y, emi: r0(emi), totalInterest: r0(total - principal), totalPaid: r0(total), emiShareOfTakeHome: takeHome ? r2(emi / takeHome) : null }; });
  const fit = takeHome ? rows.find(r => r.emi <= takeHome * 0.35) : null;
  return { principal, rate, options: rows, suggestion: fit ? { years: fit.years, why: `The shortest tenure that keeps the EMI within 35% of take-home, which saves the most interest.` } : null };
}

export function balanceTransfer({ outstanding, currentRate, newRate, remainingMonths, feePct = 0.5 }) {
  const emi = emiFor(outstanding, currentRate, remainingMonths / 12);
  const cur = loanProjection({ outstanding, rate: currentRate, emi }), nu = loanProjection({ outstanding, rate: newRate, emi });
  const fee = outstanding * feePct / 100, saving = cur.totalInterest - nu.totalInterest - fee;
  return {
    emi: r0(emi), interestNow: r0(cur.totalInterest), interestNew: r0(nu.totalInterest), monthsNow: cur.months, monthsNew: nu.months, fee: r0(fee), netSaving: r0(saving), worthIt: saving > 0 && currentRate - newRate >= 0.5,
    explain: explain({ title: 'Balance transfer', verdict: saving > 0 ? `Switching could save about ${r0(saving).toLocaleString('en-IN')} after fees.` : 'Switching would not pay off after fees.', why: [`Rate drops from ${currentRate}% to ${newRate}%.`, `Processing fee assumed at ${feePct}% of the balance.`], inputs: { outstanding, currentRate, newRate, remainingMonths, feePct }, risks: ['Check foreclosure charges on the old loan and the lender’s reset terms on the new one.'], alternatives: ['Ask your current lender to match the rate.'], confidence: 0.6, uncertainty: 'Real fees and rate resets can differ.' }),
  };
}

export function strategyCompare(loans, extra = 0) {
  if (!loans.length) return { ready: false };
  const av = avalanchePlan(loans, extra, 'avalanche'), sn = avalanchePlan(loans, extra, 'snowball');
  const diff = r0((sn.totalInterest ?? 0) - (av.totalInterest ?? 0));
  return { ready: true, avalanche: av, snowball: sn, interestDifference: diff, recommendation: diff > 0 ? 'avalanche' : 'either',
    explain: explain({ title: 'Debt repayment strategy', verdict: diff > 100 ? `Avalanche saves about ${diff.toLocaleString('en-IN')} more interest than snowball.` : 'The two strategies cost about the same for you.', why: ['Avalanche pays the highest-rate loan first, which minimises interest.', 'Snowball clears the smallest balance first, which can help motivation.'], inputs: { loans: loans.length, extraPerMonth: extra }, risks: ['Ignores prepayment penalties.'], alternatives: ['Start with snowball for early wins, then switch to avalanche.'], confidence: 0.7, uncertainty: 'Assumes fixed rates and no new borrowing.' }) };
}
