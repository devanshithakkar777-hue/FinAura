import { diffDays, parseDay, toDay } from '../lib/dates.js';
import { sortTxns } from './portfolio.js';
import { explain } from '../lib/explain.js';

/**
 * India tax estimation for the tax year 2026-27 (income-tax slabs and capital-gains rates verified against
 * current published sources; Budget 2026 left them unchanged). Estimates only — not a tax filing.
 * Not modelled: surcharge marginal relief, AMT, special-rate income in the rebate test, senior-citizen old-regime slabs.
 */
export const TAX_YEAR = '2026-27';
const NEW_SLABS = [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]];
const OLD_SLABS = [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]];
const CESS = 0.04, r0 = n => Math.round(n), r2 = n => Math.round(n * 100) / 100;

function slabTax(income, slabs) {
  let prev = 0, tax = 0;
  for (const [cap, rate] of slabs) { if (income > prev) tax += (Math.min(income, cap) - prev) * rate; prev = cap; }
  return tax;
}
export const marginalRate = (income, slabs) => { let prev = 0; for (const [cap, rate] of slabs) { if (income <= cap) return rate; prev = cap; } return prev ? slabs.at(-1)[1] : 0; };
function surchargeRate(income, regime) { return income > 2e7 ? (regime === 'new' ? 0.25 : income > 5e7 ? 0.37 : 0.25) : income > 1e7 ? 0.15 : income > 5e6 ? 0.10 : 0; }

export function hraExemption({ hraReceived = 0, rentPaid = 0, basic = 0, metro = false }) {
  if (!hraReceived || !rentPaid) return 0;
  return Math.max(0, Math.min(hraReceived, rentPaid - 0.1 * basic, (metro ? 0.5 : 0.4) * basic));
}

export function computeRegime(regime, i) {
  const gross = i.grossIncome + (i.otherIncome ?? 0);
  const basic = i.basic ?? i.grossIncome * 0.4;
  const stdDed = i.grossIncome > 0 ? (regime === 'new' ? 75000 : 50000) : 0;
  const employerNps = Math.min(i.employerNps ?? 0, basic * (regime === 'new' ? 0.14 : 0.10));
  let deductions = stdDed + employerNps;
  const detail = { standardDeduction: stdDed, employerNps };
  if (regime === 'old') {
    detail.hra = hraExemption({ hraReceived: i.hraReceived, rentPaid: i.rentPaid, basic, metro: i.metro });
    detail.section80C = Math.min(i.c80 ?? 0, 150000);
    detail.section80D = Math.min(i.d80Self ?? 0, 25000) + Math.min(i.d80Parents ?? 0, i.seniorParents ? 50000 : 25000);
    detail.nps80CCD1B = Math.min(i.nps1b ?? 0, 50000);
    detail.homeLoanInterest = Math.min(i.homeLoanInterest ?? 0, 200000);
    deductions += Object.entries(detail).filter(([k]) => !['standardDeduction', 'employerNps'].includes(k)).reduce((s, [, v]) => s + v, 0);
  }
  const taxable = Math.max(0, gross - deductions);
  const base = slabTax(taxable, regime === 'new' ? NEW_SLABS : OLD_SLABS);
  let afterRebate = base;
  if (regime === 'new' && taxable <= 1200000) afterRebate = Math.max(0, base - 60000);
  else if (regime === 'new' && taxable > 1200000) afterRebate = Math.min(base, taxable - 1200000);   // marginal relief
  else if (regime === 'old' && taxable <= 500000) afterRebate = Math.max(0, base - 12500);
  const surcharge = afterRebate * surchargeRate(taxable, regime);
  const cess = (afterRebate + surcharge) * CESS;
  return { regime, grossIncome: r0(gross), deductions: r0(deductions), deductionDetail: Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, r0(v)])), taxableIncome: r0(taxable), taxBeforeRebate: r0(base), rebate: r0(base - afterRebate), surcharge: r0(surcharge), cess: r0(cess), totalTax: r0(afterRebate + surcharge + cess), effectiveRate: gross ? r2((afterRebate + surcharge + cess) / gross) : 0, marginalRate: marginalRate(taxable, regime === 'new' ? NEW_SLABS : OLD_SLABS) };
}

export function compareRegimes(i) {
  if (!(i.grossIncome > 0)) return { ready: false, missing: ['annual income'] };
  const nw = computeRegime('new', i), old = computeRegime('old', i);
  const better = old.totalTax < nw.totalTax ? 'old' : 'new', saving = Math.abs(old.totalTax - nw.totalTax);
  const breakEven = (() => { const need = old.deductions; return r0(need); })();
  return {
    ready: true, taxYear: TAX_YEAR, new: nw, old, better, saving: r0(saving), oldRegimeBreakEvenDeductions: breakEven,
    tdsPaid: i.tdsPaid ?? null, refundOrDue: i.tdsPaid != null ? r0((i.tdsPaid ?? 0) - Math.min(nw.totalTax, old.totalTax)) : null,
    explain: explain({
      title: 'Tax regime comparison', verdict: saving < 1 ? 'Both regimes give the same tax.' : `The ${better} regime saves you about ${r0(saving).toLocaleString('en-IN')}.`,
      why: [`New regime: taxable ${nw.taxableIncome.toLocaleString('en-IN')}, tax ${nw.totalTax.toLocaleString('en-IN')}.`, `Old regime: deductions of ${old.deductions.toLocaleString('en-IN')} leave taxable ${old.taxableIncome.toLocaleString('en-IN')}, tax ${old.totalTax.toLocaleString('en-IN')}.`],
      inputs: { grossIncome: i.grossIncome, otherIncome: i.otherIncome ?? 0, deductionsEntered: old.deductionDetail }, risks: ['Rules and thresholds can change each Budget.', 'Surcharge marginal relief and special-rate incomes are not modelled.', 'Salaried employees pick a regime with the employer each year; non-salaried choices are stricter.'],
      alternatives: better === 'new' ? ['Claim more deductions only if they total more than the break-even above.'] : ['Make sure deductions are backed by proofs before filing.'], confidence: 0.75, uncertainty: 'An estimate from the figures you entered; your actual liability depends on all income and exemptions.',
    }),
  };
}

export function savingOpportunities(i) {
  const old = computeRegime('old', i), m = old.marginalRate * (1 + CESS), out = [];
  const add = (section, used, cap, note) => { const head = Math.max(0, cap - used); if (head > 0 && m > 0) out.push({ section, used: r0(used), limit: cap, headroom: r0(head), potentialSaving: r0(head * m), note }); };
  add('80C', i.c80 ?? 0, 150000, 'ELSS, PPF, EPF, life insurance premium, home-loan principal and tuition fees all count.');
  add('80D (self & family)', i.d80Self ?? 0, 25000, 'Health-insurance premium and preventive check-ups.');
  add('80D (parents)', i.d80Parents ?? 0, i.seniorParents ? 50000 : 25000, 'Health cover for parents.');
  add('80CCD(1B)', i.nps1b ?? 0, 50000, 'Extra NPS contribution, above the 80C limit.');
  return { regimeNote: 'These help only under the old regime. Check the regime comparison first.', oldRegimeMarginalRate: old.marginalRate, opportunities: out, totalPotentialSaving: out.reduce((s, x) => s + x.potentialSaving, 0) };
}

// ── Capital gains ────────────────────────────────────────────────────
export const fyOf = day => { const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)); const s = m >= 4 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
export const fyRange = fy => { const s = Number(fy.slice(0, 4)); return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; };

const RULES = { equity: { longDays: 365, st: 'eq', lt: 'eq' }, mutualFund: { longDays: 365, st: 'eq', lt: 'eq' }, bond: { longDays: 365, st: 'slab', lt: 'other' }, gold: { longDays: 730, st: 'slab', lt: 'other' }, crypto: { longDays: Infinity, st: 'vda', lt: 'vda' } };
export const LTCG_EXEMPTION = 125000, STCG_EQ = 0.20, LTCG_RATE = 0.125, VDA = 0.30;

/** FIFO matching with dates. Returns one piece per (sale, lot) pair. */
export function realisedPieces(txns, assets) {
  const lots = new Map(), pieces = [];
  for (const t of sortTxns(txns)) {
    const q = Number(t.quantity), p = Number(t.price);
    if (t.side === 'buy') { (lots.get(t.symbol) ?? lots.set(t.symbol, []).get(t.symbol)).push({ qty: q, price: p, day: t.executed_on }); continue; }
    let left = q; const l = lots.get(t.symbol) ?? [];
    while (left > 1e-9 && l.length) {
      const take = Math.min(left, l[0].qty);
      const cls = assets.get(t.symbol)?.asset_class ?? 'equity', held = diffDays(t.executed_on, l[0].day);
      const rule = RULES[cls];
      if (rule) { const long = held > rule.longDays; pieces.push({ symbol: t.symbol, sellId: t.id ?? `${t.symbol}-${t.executed_on}`, assetClass: cls, buyDay: l[0].day, sellDay: t.executed_on, qty: take, gain: take * (p - l[0].price), held, term: long ? 'long' : 'short', bucket: long ? rule.lt : rule.st }); }
      l[0].qty -= take; left -= take; if (l[0].qty <= 1e-9) l.shift();
    }
  }
  return pieces;
}

/** Net gains by tax bucket with the allowed set-offs, then the estimated tax. */
export function taxOnGains(pieces, slabRate = 0.30) {
  const b = { eqShort: 0, slabShort: 0, eqLong: 0, otherLong: 0 };
  let vda = 0; const vdaBySale = new Map();
  for (const p of pieces) {
    if (p.bucket === 'vda') vdaBySale.set(p.sellId, (vdaBySale.get(p.sellId) ?? 0) + p.gain);
    else if (p.bucket === 'eq') (p.term === 'short' ? (b.eqShort += p.gain) : (b.eqLong += p.gain));
    else if (p.bucket === 'slab') b.slabShort += p.gain; else b.otherLong += p.gain;
  }
  for (const g of vdaBySale.values()) if (g > 0) vda += g;                       // VDA losses cannot be set off
  const gross = { ...b };
  // Short-term losses offset any gain (highest-rate first); long-term losses only long-term gains.
  for (const k of ['eqShort', 'slabShort']) if (b[k] < 0) {
    let loss = -b[k]; b[k] = 0;
    for (const t of k === 'eqShort' ? ['slabShort', 'otherLong', 'eqLong'] : ['eqShort', 'otherLong', 'eqLong']) { const use = Math.min(loss, Math.max(0, b[t])); b[t] -= use; loss -= use; }
    // the loss that is left carries forward (not modelled beyond reporting)
    b[k] -= loss; b.__carry = (b.__carry ?? 0) + loss;
  }
  for (const k of ['otherLong', 'eqLong']) if (b[k] < 0) {
    let loss = -b[k]; b[k] = 0;
    for (const t of k === 'otherLong' ? ['eqLong'] : ['otherLong']) { const use = Math.min(loss, Math.max(0, b[t])); b[t] -= use; loss -= use; }
    b[k] -= loss; b.__carry = (b.__carry ?? 0) + loss;
  }
  const carry = b.__carry ?? 0; delete b.__carry;
  const eqLongTaxable = Math.max(0, b.eqLong - LTCG_EXEMPTION);
  const tax = Math.max(0, b.eqShort) * STCG_EQ + Math.max(0, b.slabShort) * slabRate + eqLongTaxable * LTCG_RATE + Math.max(0, b.otherLong) * LTCG_RATE + vda * VDA;
  return {
    gross, net: b, exemptionUsed: Math.min(Math.max(0, b.eqLong), LTCG_EXEMPTION), exemptionHeadroom: Math.max(0, LTCG_EXEMPTION - Math.max(0, b.eqLong)), vdaTaxableGain: r2(vda), lossCarryForward: r2(carry),
    tax: r0(tax * (1 + CESS)), taxBeforeCess: r0(tax),
  };
}

export function capitalGainsReport({ txns, assets, fy, slabRate = 0.30 }) {
  const { from, to } = fyRange(fy);
  const pieces = realisedPieces(txns, assets).filter(p => p.sellDay >= from && p.sellDay <= to);
  const res = taxOnGains(pieces, slabRate);
  const bySymbol = {};
  for (const p of pieces) { const s = (bySymbol[p.symbol] ??= { symbol: p.symbol, assetClass: p.assetClass, short: 0, long: 0 }); s[p.term] += p.gain; }
  return {
    fy, from, to, ...res,
    realisations: Object.values(bySymbol).map(s => ({ ...s, short: r2(s.short), long: r2(s.long) })), pieces: pieces.length,
    assumptions: ['Mutual funds are treated as equity-oriented (12-month rule). Debt funds are taxed at slab rates and would differ.', 'Gold and bonds use a 24-month and 12-month long-term test respectively.', 'Crypto: flat 30% on gains per transfer, no loss set-off; 1% TDS may also apply.', 'Surcharge and brought-forward losses are not included.'],
    explain: explain({ title: `Capital gains ${fy}`, verdict: `Estimated capital-gains tax is ${res.tax.toLocaleString('en-IN')}.`, why: [`Short-term equity gains are taxed at ${STCG_EQ * 100}%; long-term equity gains at ${LTCG_RATE * 100}% above ${LTCG_EXEMPTION.toLocaleString('en-IN')} a year.`, `${r0(res.exemptionHeadroom).toLocaleString('en-IN')} of the long-term exemption is still unused.`], inputs: { sales: pieces.length }, risks: ['Based on the trades you logged; missing or wrong trades change the answer.', 'Check the treatment of each fund with your broker statement or a CA.'], alternatives: ['Spread large sales across tax years to use the exemption twice.'], confidence: 0.65, uncertainty: 'Fund classification and corporate actions are not captured.' }),
  };
}

/** Unrealised lots, to simulate tax-loss and tax-gain harvesting. */
export function harvestingPlan({ txns, assets, priceNow, today, fy, slabRate = 0.30 }) {
  const realised = realisedPieces(txns, assets).filter(p => p.sellDay >= fyRange(fy).from && p.sellDay <= fyRange(fy).to);
  const before = taxOnGains(realised, slabRate);
  const lots = new Map(); const hypoth = [];
  for (const t of sortTxns(txns)) {
    if (t.side === 'buy') { (lots.get(t.symbol) ?? lots.set(t.symbol, []).get(t.symbol)).push({ qty: Number(t.quantity), price: Number(t.price), day: t.executed_on }); continue; }
    let left = Number(t.quantity); const l = lots.get(t.symbol) ?? [];
    while (left > 1e-9 && l.length) { const take = Math.min(left, l[0].qty); l[0].qty -= take; left -= take; if (l[0].qty <= 1e-9) l.shift(); }
  }
  const losses = [], gains = [];
  for (const [symbol, l] of lots) {
    const px = priceNow.get(symbol); const cls = assets.get(symbol)?.asset_class ?? 'equity'; const rule = RULES[cls];
    if (!px || !rule) continue;
    for (const x of l) {
      const gain = x.qty * (px - x.price), held = diffDays(today, x.day), long = held > rule.longDays;
      const piece = { symbol, sellId: `h-${symbol}-${x.day}`, assetClass: cls, buyDay: x.day, sellDay: today, qty: x.qty, gain, held, term: long ? 'long' : 'short', bucket: long ? rule.lt : rule.st };
      if (gain < 0 && cls !== 'crypto') { losses.push(piece); hypoth.push(piece); }
      else if (gain > 0 && piece.bucket === 'eq' && long) gains.push(piece);
    }
  }
  const after = taxOnGains([...realised, ...hypoth], slabRate);
  const headroom = before.exemptionHeadroom, availableGains = gains.reduce((s, g) => s + g.gain, 0);
  const bookable = Math.min(headroom, availableGains);
  return {
    fy, harvestableLosses: r0(-losses.reduce((s, p) => s + p.gain, 0)), lossLots: losses.map(p => ({ symbol: p.symbol, loss: r2(-p.gain), term: p.term, buyDay: p.buyDay })).sort((a, b) => b.loss - a.loss).slice(0, 20),
    taxNow: before.tax, taxAfterHarvest: after.tax, estimatedSaving: Math.max(0, before.tax - after.tax),
    gainHarvest: { exemptionHeadroom: r0(headroom), unrealisedLongTermEquityGains: r0(availableGains), bookableTaxFree: r0(bookable), futureTaxAvoided: r0(bookable * LTCG_RATE * (1 + CESS)) },
    explain: explain({ title: 'Tax-loss harvesting simulation', verdict: before.tax - after.tax > 0 ? `Booking your losses could cut this year’s capital-gains tax by about ${(before.tax - after.tax).toLocaleString('en-IN')}.` : 'Booking losses would not change this year’s tax right now.',
      why: ['Losses reduce gains that would otherwise be taxed; short-term losses can offset any gain, long-term losses only long-term gains.', headroom > 0 ? `You can still book ${r0(bookable).toLocaleString('en-IN')} of long-term equity gains tax-free this year.` : 'The long-term exemption is already used up.'],
      inputs: { lossLots: losses.length, realisedPieces: realised.length }, risks: ['Selling to harvest means you are out of the market until you buy back, and costs (brokerage, STT, exit load) apply.', 'Repurchase rules and anti-avoidance provisions can change; confirm with a CA before relying on this.', 'This simulation assumes you sell today at the latest known price.'],
      alternatives: ['Switch to a similar but different holding instead of repurchasing the same one.', 'Do nothing — avoiding unneeded trades is a valid choice.'], confidence: 0.55, uncertainty: 'Latest prices may be stale or based on your own trade prices.' }),
  };
}

export const DOC_CHECKLIST = [
  { key: 'form16', label: 'Form 16 from employer', when: i => i.grossIncome > 0 },
  { key: 'ais', label: 'Annual Information Statement (AIS / Form 26AS)', when: () => true },
  { key: 'rent', label: 'Rent receipts and landlord PAN', when: i => (i.rentPaid ?? 0) > 0 },
  { key: 'proofs80c', label: '80C investment proofs (ELSS, PPF, LIC, tuition)', when: i => (i.c80 ?? 0) > 0 },
  { key: 'health', label: 'Health-insurance premium receipts (80D)', when: i => (i.d80Self ?? 0) + (i.d80Parents ?? 0) > 0 },
  { key: 'nps', label: 'NPS contribution statement', when: i => (i.nps1b ?? 0) + (i.employerNps ?? 0) > 0 },
  { key: 'homeloan', label: 'Home-loan interest certificate', when: i => (i.homeLoanInterest ?? 0) > 0 },
  { key: 'cg', label: 'Broker capital-gains statement', when: i => i.hasTrades },
  { key: 'bank', label: 'Bank interest certificates', when: () => true },
  { key: 'foreign', label: 'Foreign asset and income details (Schedule FA)', when: i => i.hasForeign },
];
export const documentChecklist = (i, done = {}) => DOC_CHECKLIST.filter(d => d.when(i)).map(d => ({ key: d.key, label: d.label, done: !!done[d.key] }));

export { parseDay, toDay };
