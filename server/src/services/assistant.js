import { todayStr } from '../lib/dates.js';
import { loadWealthState } from '../routes/planning.js';
import { retirementPlan, emergencyFund, insuranceAnalysis } from '../engines/planning.js';
import { stressTest } from '../engines/stress.js';
import { simulateLife, lifeStateFrom } from '../engines/lifemodel.js';
import { hashSeed } from '../engines/twin.js';
import { compareRegimes } from '../engines/tax.js';
import { cashflowAnalysis } from '../engines/wallet.js';
import { strategyCompare } from '../engines/credit.js';
import { signalFor } from '../engines/planning.js';
import { loadProfile } from '../routes/wealth.js';

const fmt = n => Math.round(n).toLocaleString('en-IN');
const pct = n => `${Math.round(n * 100)}%`;

/** Topics where a regulated, personalised recommendation or specialist judgement is needed. */
export const ESCALATION = [
  { re: /(sell|liquidate|withdraw).*(invest|stock|fund|portfolio).*(house|flat|property|home|wedding|car)|(house|flat|property|home).*(sell|liquidate).*(invest|stock)/i, category: 'Certified financial planner', reason: 'Selling investments to fund a large purchase is a personal advice decision.' },
  { re: /\bnri\b|abroad|overseas|foreign income|cross[- ]border|\bh1b\b|\bgreen card\b/i, category: 'Cross-border tax / NRI specialist', reason: 'Cross-border tax and residency rules need a qualified specialist.' },
  { re: /\bwill\b|inherit|succession|estate|nominee|trust\b/i, category: 'Estate & succession planner', reason: 'Wills and succession have legal consequences.' },
  { re: /notice|scrutiny|penalty|itr|audit|refund stuck|demand/i, category: 'Chartered accountant', reason: 'Tax notices and filings should go through a CA.' },
  { re: /claim.*reject|insurance.*(dispute|claim)|mis-?sold|grievance|complaint/i, category: 'Insurance adviser / dispute help', reason: 'Disputes and claims benefit from a professional.' },
  { re: /\b(should i|which|what).*(buy|sell|invest in)\b/i, category: 'SEBI-registered investment adviser', reason: 'Telling you what to buy or sell is regulated advice. FinAura can model trade-offs but not recommend securities.' },
];
export const escalationFor = text => { const hit = ESCALATION.find(e => e.re.test(text)); return hit ? { recommended: true, category: hit.category, reason: hit.reason } : { recommended: false }; };

export const INTENTS = [
  ['whatif_fall', /(fall|crash|drop|decline|down|correction)\D{0,25}(\d{1,2})\s*%|(\d{1,2})\s*%\D{0,25}(fall|crash|drop|decline|correction)/i],
  ['diversified', /diversif|concentrat|spread|too much in|all my eggs|balanced/i],
  ['retirement', /retire|retirement|corpus|pension|financial freedom/i],
  ['emergency', /emergency|rainy|buffer|safety net/i],
  ['networth', /net ?worth|how much (am i|do i)|total (assets|wealth)|my assets/i],
  ['debt', /\bloan|debt|emi\b|credit card|borrow|prepay|owe/i],
  ['tax', /\btax|regime|capital gain|80c|itr\b/i],
  ['insurance', /insur|term plan|health cover|coverage|\bcover\b/i],
  ['spending', /spend|budget|expens|saving|cash ?flow|subscription/i],
  ['signals', /\b(buy|sell|hold|trim|accumulate|overbought|rsi)\b/i],
];
export const detectIntent = msg => (INTENTS.find(([, re]) => re.test(msg)) ?? ['overview'])[0];
export const fallPct = msg => { const m = msg.match(/(\d+(?:\.\d+)?)\s*%/); return m ? Math.min(90, Math.max(1, Number(m[1]))) / 100 : 0.2; };

/** Gather facts and a deterministic answer for the user's question. The LLM may only rephrase this. */
export async function gather(app, user, message) {
  const { pool } = app, today = todayStr(), intent = detectIntent(message);
  const s = await loadWealthState(pool, user, today), { ctx, nw, profile } = s;
  const base = { currency: user.currency, netWorth: Math.round(nw.netWorth), totalAssets: Math.round(nw.totalAssets), totalDebt: Math.round(nw.totalDebt) };
  let facts = base, answer = '', actions = [];
  switch (intent) {
    case 'diversified': {
      if (!ctx.positions.length && !nw.totalAssets) { answer = 'You have not added any holdings yet, so I cannot assess diversification. Add a few and I will check.'; break; }
      const top = ctx.positions[0], groups = nw.allocation.map(a => ({ group: a.group, share: Math.round(a.weight * 100) }));
      facts = { ...base, health: ctx.health, groups, largestHolding: top ? { symbol: top.symbol, share: Math.round(top.weight * 100) } : null };
      const ok = ctx.health.diversification >= 70 && (!top || top.weight <= 0.3);
      answer = `${ok ? 'Yes, reasonably.' : 'Not as much as you could be.'} Your diversification score is ${ctx.health.diversification}/100 across ${groups.length} asset group(s).${top ? ` Your largest holding, ${top.symbol}, is ${pct(top.weight)} of your market portfolio.` : ''}`;
      if (!ok) actions.push('Direct new money to the groups you hold least of.', 'Keep any single holding under about 25–30%.');
      break;
    }
    case 'whatif_fall': {
      const x = fallPct(message), shocks = { equity: -x, mutualFund: -x * 0.9, crypto: -Math.min(0.95, x * 1.6), bond: 0, gold: 0, cash: 0, realEstate: -x * 0.2 };
      const r = stressTest(nw, profile, undefined, shocks).scenarios[0];
      facts = { ...base, shockPct: Math.round(x * 100), assetsAfter: r.assetsAfter, loss: r.loss, lossPct: r.lossPct, monthlyGap: r.monthlyGap, runwayMonths: r.runwayMonths };
      answer = `If equities fall ${Math.round(x * 100)}% (and crypto fall more), your assets would drop by about ${fmt(Math.abs(r.loss))} (${pct(Math.abs(r.lossPct))}), leaving net worth near ${fmt(r.netWorthAfter)}. Bonds, gold and cash are assumed flat.`;
      if (r.severity !== 'mild') actions.push('Check that you could keep investing, not sell, through a drop this size.');
      break;
    }
    case 'retirement': {
      const lifeState = lifeStateFrom(s), life = simulateLife(lifeState, [], { paths: 200, seed: hashSeed(String(user.id)) });
      const plan = retirementPlan({ profile, investable: s.investable, monthlySaving: s.goalMonthly, allocation: nw.allocation });
      facts = { ...base, retirement: plan.ready ? { years: plan.years, corpusNeeded: plan.corpusNeeded, projected: plan.projectedCorpus, readiness: plan.readiness, extraSipNeeded: plan.extraSipNeeded } : { missing: plan.missing }, probabilityFundsLast: life.probabilityFundsLast, assumed: lifeState.assumed };
      answer = plan.ready ? `To retire at ${profile.retirementAge} you need roughly ${fmt(plan.corpusNeeded)} (future rupees). You are projected to reach about ${pct(plan.readiness)} of that, and your money lasts to 85 in ${pct(life.probabilityFundsLast)} of simulated futures. ${plan.extraSipNeeded > 0 ? `Closing the gap would take roughly ${fmt(plan.extraSipNeeded)} more per month.` : 'Your current saving is enough on these assumptions.'}` : `I need your ${plan.missing.join(', ')} to work out retirement. Add them in your profile.`;
      break;
    }
    case 'emergency': {
      const e = emergencyFund({ profile, liquid: nw.liquidAssets, monthlyEmi: nw.monthlyEmi });
      facts = { ...base, emergency: e.ready ? { targetMonths: e.targetMonths, target: e.target, coverageMonths: e.coverageMonths, gap: e.gap } : { missing: e.missing } };
      answer = e.ready ? `You should hold about ${e.targetMonths} months of expenses (${fmt(e.target)}). You hold ${e.coverageMonths.toFixed(1)} months of cash-like assets${e.gap ? `, a gap of ${fmt(e.gap)}` : ''}.` : 'Tell me your monthly expenses in your profile and I will size your emergency fund.';
      break;
    }
    case 'networth': {
      facts = { ...base, marketValue: Math.round(nw.marketValue), manualValue: Math.round(nw.manualValue), debtToAsset: nw.debtToAsset == null ? null : Math.round(nw.debtToAsset * 100) / 100 };
      answer = `Your net worth is ${fmt(nw.netWorth)}: ${fmt(nw.totalAssets)} of assets less ${fmt(nw.totalDebt)} of debt.${nw.debtToAsset != null && nw.debtToAsset > 0.5 ? ' Debt is more than half your assets, which leaves little cushion.' : ''}`;
      break;
    }
    case 'debt': {
      const loans = (await pool.query('SELECT * FROM liabilities WHERE user_id = $1', [user.id])).rows;
      if (!loans.length) { answer = 'You have not added any loans. Add them and I can compare repayment strategies and interest costs.'; break; }
      const c = strategyCompare(loans, 0), hi = s.loans.filter(l => l.highInterest);
      facts = { ...base, loans: s.loans.map(l => ({ name: l.name, outstanding: l.outstanding, rate: l.rate, emi: l.emi, monthsLeft: l.monthsLeft })), highInterest: hi.map(l => l.name), avalancheInterest: c.avalanche.totalInterest, snowballInterest: c.snowball.totalInterest, monthlyEmi: nw.monthlyEmi };
      answer = `You owe ${fmt(nw.totalDebt)} with EMIs of ${fmt(nw.monthlyEmi)} a month.${hi.length ? ` ${hi.map(l => l.name).join(', ')} charge${hi.length === 1 ? 's' : ''} 15% or more, so ${hi.length === 1 ? 'that is' : 'those are'} the first to clear.` : ''} Paying the highest rate first (avalanche) would cost ${fmt(c.avalanche.totalInterest)} in interest against ${fmt(c.snowball.totalInterest)} for smallest-first.`;
      break;
    }
    case 'tax': {
      const row = (await pool.query('SELECT data FROM tax_inputs WHERE user_id = $1', [user.id])).rows[0];
      const cmp = compareRegimes({ grossIncome: profile.annualIncome ?? 0, ...(row?.data ?? {}) });
      facts = { ...base, tax: cmp.ready ? { newRegimeTax: cmp.new.totalTax, oldRegimeTax: cmp.old.totalTax, better: cmp.better, saving: cmp.saving } : { missing: cmp.missing } };
      answer = cmp.ready ? `On the figures you entered, the ${cmp.better} regime is cheaper by about ${fmt(cmp.saving)} (new ${fmt(cmp.new.totalTax)} vs old ${fmt(cmp.old.totalTax)}). This is an estimate, not a filing.` : 'Add your annual income in your profile and I will compare the two tax regimes.';
      break;
    }
    case 'insurance': {
      const pol = (await pool.query('SELECT * FROM insurance_policies WHERE user_id = $1', [user.id])).rows.map(p => ({ kind: p.kind, sumAssured: Number(p.sum_assured), annualPremium: Number(p.annual_premium) }));
      const a = insuranceAnalysis({ profile, policies: pol, debt: nw.totalDebt, liquidAssets: nw.liquidAssets });
      facts = { ...base, insurance: { life: a.totals.life, health: a.totals.health, gaps: a.gaps.map(g => ({ kind: g.kind, have: g.have, need: g.need, gap: g.gap })) } };
      answer = a.gaps.length ? `I see ${a.gaps.length} gap(s): ${a.gaps.map(g => g.gap ? `${g.kind} cover short by ${fmt(g.gap)}` : `${g.kind}: ${g.note}`).join('; ')}.` : 'Your life and health cover look adequate on these rules of thumb.';
      break;
    }
    case 'spending': {
      const txns = (await pool.query('SELECT day, amount::float AS amount, direction, category, merchant, description FROM cash_txns WHERE user_id = $1', [user.id])).rows.map(r => ({ ...r, day: String(r.day).slice(0, 10) }));
      const a = cashflowAnalysis(txns, today);
      facts = { ...base, cashflow: a.ready ? { avgIncome: a.avgIncome, avgSpend: a.avgSpend, savingsRate: a.savingsRate, topCategories: a.categories.slice(0, 3).map(c => ({ category: c.category, amount: c.amount })), tips: a.tips.map(t => t.note) } : { note: a.note } };
      answer = a.ready ? `You earn about ${fmt(a.avgIncome)} and spend about ${fmt(a.avgSpend)} a month, saving ${a.savingsRate == null ? '—' : pct(a.savingsRate)}. ${a.tips[0]?.note ?? ''}`.trim() : 'Add or import a few months of transactions and I will analyse your spending.';
      break;
    }
    case 'signals': {
      const sigs = ctx.positions.map(p => signalFor(p, ctx.seriesBySymbol.get(p.symbol) ?? [], ctx.rsi.get(p.symbol) ?? null, ctx.riskProfile));
      facts = { ...base, signals: sigs.map(x => ({ symbol: x.symbol, signal: x.action, weight: Math.round(x.weight * 100), why: x.explain.why.slice(0, 2) })) };
      answer = sigs.length ? `Signals: ${sigs.map(x => `${x.symbol} → ${x.action}`).join(', ')}. These come from momentum, trend and concentration, and are prompts to think, not trade instructions.` : 'You have no market holdings to analyse yet.';
      break;
    }
    default: {
      const life = simulateLife(lifeStateFrom(s), [], { paths: 120, seed: hashSeed(String(user.id)) });
      facts = { ...base, health: ctx.health.total || null, probabilityFundsLast: life.probabilityFundsLast };
      answer = `Your net worth is ${fmt(nw.netWorth)}. ${ctx.health.total ? `Portfolio health is ${ctx.health.total}/100. ` : ''}In ${pct(life.probabilityFundsLast)} of simulated futures your money lasts to 85. Ask me about diversification, retirement, a market fall, loans, tax or insurance.`;
    }
  }
  void loadProfile;
  return { intent, facts, answer, actions, escalation: escalationFor(message) };
}
