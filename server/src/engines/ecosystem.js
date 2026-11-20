import { explain } from '../lib/explain.js';

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r0 = n => Math.round(n);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ── Financial wellness score ─────────────────────────────────────── */
export const WELLNESS_WEIGHTS = { emergency: 20, debt: 20, savings: 20, insurance: 15, diversification: 10, retirement: 15 };
export function wellnessScore({ profile, nw, emergency, insurance, diversification, retirement }) {
  const monthlyIncome = profile?.annualIncome ? profile.annualIncome / 12 : null;
  const parts = {};
  if (emergency?.ready) parts.emergency = { score: clamp((emergency.coverageMonths / emergency.targetMonths) * 100), detail: `${emergency.coverageMonths.toFixed(1)} of ${emergency.targetMonths} months covered` };
  if (monthlyIncome) {
    const dsr = (nw.monthlyEmi ?? 0) / monthlyIncome;
    parts.debt = { score: clamp(100 - ((dsr - 0.2) / 0.3) * 100), detail: `EMIs take ${Math.round(dsr * 100)}% of income` };
    if (profile.monthlyExpenses != null) {
      const sr = (monthlyIncome - profile.monthlyExpenses) / monthlyIncome;
      parts.savings = { score: clamp((sr / 0.2) * 100), detail: `Saving about ${Math.round(sr * 100)}% of income (target 20%)` };
    }
  }
  if (insurance) {
    const gaps = insurance.gaps.filter(g => g.gap > 0);
    parts.insurance = { score: clamp(100 - gaps.length * 50), detail: gaps.length ? `Short on ${gaps.map(g => g.kind).join(' and ')} cover` : 'Life and health cover look adequate' };
  }
  if (diversification != null && nw.totalAssets > 0) parts.diversification = { score: clamp(diversification), detail: `Diversification ${Math.round(diversification)}/100` };
  if (retirement?.ready) parts.retirement = { score: clamp(retirement.readiness * 100), detail: `On track for ${Math.round(retirement.readiness * 100)}% of the retirement corpus` };
  const keys = Object.keys(parts), wsum = keys.reduce((s, k) => s + WELLNESS_WEIGHTS[k], 0);
  const missing = Object.keys(WELLNESS_WEIGHTS).filter(k => !parts[k]);
  if (!keys.length) return { ready: false, missing, note: 'Add your income, expenses and a few assets to get a wellness score.' };
  const score = r0(keys.reduce((s, k) => s + parts[k].score * WELLNESS_WEIGHTS[k], 0) / wsum);
  const band = score >= 80 ? 'strong' : score >= 60 ? 'steady' : score >= 40 ? 'needs attention' : 'fragile';
  const weakest = keys.map(k => ({ key: k, ...parts[k] })).sort((a, b) => a.score - b.score)[0];
  return {
    ready: true, score, band, coverage: Math.round((wsum / 100) * 100) / 100, missing, weakest: weakest.key,
    components: keys.map(k => ({ key: k, weight: WELLNESS_WEIGHTS[k], score: r0(parts[k].score), detail: parts[k].detail })),
    explain: explain({
      title: 'Financial wellness score', verdict: `${score}/100 (${band})`,
      why: keys.map(k => `${k}: ${r0(parts[k].score)}/100 — ${parts[k].detail}`), inputs: { weights: WELLNESS_WEIGHTS, components: keys },
      risks: ['This is a simple rules-of-thumb score, not a rating or a credit score.', ...(missing.length ? [`Not scored for lack of data: ${missing.join(', ')}.`] : [])],
      alternatives: ['Different weightings would give a different number; use the trend more than the absolute value.'],
      confidence: wsum >= 80 ? 0.75 : wsum >= 50 ? 0.6 : 0.4, uncertainty: 'Depends on the accuracy of what you entered; missing components are excluded and the rest re-weighted.',
    }),
  };
}

/* ── Benchmarks (rules of thumb) ─────────────────────────────────── */
export function benchmarks({ profile, nw, emergency, insurance }) {
  const rows = [], inc = profile?.annualIncome ? profile.annualIncome / 12 : null;
  if (inc && profile.monthlyExpenses != null) { const v = (inc - profile.monthlyExpenses) / inc; rows.push({ key: 'savings_rate', label: 'Savings rate', yours: v, target: '≥ 20%', ok: v >= 0.2 }); }
  if (inc) { const v = (nw.monthlyEmi ?? 0) / inc; rows.push({ key: 'debt_service', label: 'EMIs as share of income', yours: v, target: '≤ 35%', ok: v <= 0.35 }); }
  if (emergency?.ready) rows.push({ key: 'emergency', label: 'Emergency fund (months)', yours: emergency.coverageMonths, target: `≥ ${emergency.targetMonths}`, ok: emergency.coverageMonths >= emergency.targetMonths });
  if (insurance && profile?.annualIncome) { const v = insurance.totals.life / profile.annualIncome; rows.push({ key: 'life_cover', label: 'Life cover as multiple of income', yours: v, target: '10–15×', ok: v >= 10 }); }
  return { rows, note: 'Common rules of thumb, not personalised advice. Your situation may justify different targets.' };
}

/* ── Dividends ───────────────────────────────────────────────────── */
export function dividendSummary({ records, manualAnnualIncome = 0, marketValue = 0, today }) {
  const t = new Date(`${today}T00:00:00Z`), from = new Date(t); from.setUTCFullYear(from.getUTCFullYear() - 1);
  const ttmRecs = records.filter(r => new Date(`${r.received_on}T00:00:00Z`) > from && new Date(`${r.received_on}T00:00:00Z`) <= t);
  const ttm = ttmRecs.reduce((s, r) => s + r.amount, 0);
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0 }));
  ttmRecs.forEach(r => { byMonth[Number(r.received_on.slice(5, 7)) - 1].amount += r.amount; });
  const bySymbol = Object.entries(ttmRecs.reduce((m, r) => ({ ...m, [r.symbol]: (m[r.symbol] ?? 0) + r.amount }), {})).map(([symbol, amount]) => ({ symbol, amount })).sort((a, b) => b.amount - a.amount);
  const annual = ttm + manualAnnualIncome;
  return { ttm: r0(ttm), manualAnnualIncome: r0(manualAnnualIncome), forwardEstimate: r0(annual), monthlyAverage: r0(annual / 12), yieldOnMarketValue: marketValue > 0 ? Math.round((ttm / marketValue) * 10000) / 10000 : null, byMonth, bySymbol, note: 'Forward estimate assumes the last twelve months repeat. Dividends can be cut or skipped, and they are taxed as income.' };
}

/* ── Household / couple finance ──────────────────────────────────── */
export function splitRatio(incomes) { const tot = incomes.reduce((s, i) => s + i.income, 0); return incomes.map(i => ({ ...i, ratio: tot > 0 ? i.income / tot : 1 / incomes.length })); }
export function settleExpenses(expenses, members) {
  const total = expenses.reduce((s, e) => s + e.amount, 0), withRatio = splitRatio(members);
  const bal = withRatio.map(m => { const paid = expenses.filter(e => e.paidBy === m.userId).reduce((s, e) => s + e.amount, 0); return { userId: m.userId, paid: r0(paid), share: r0(total * m.ratio), ratio: Math.round(m.ratio * 100) / 100, balance: r0(paid - total * m.ratio) }; });
  const debtors = bal.filter(b => b.balance < 0).map(b => ({ ...b, left: -b.balance })), creditors = bal.filter(b => b.balance > 0).map(b => ({ ...b, left: b.balance })), transfers = [];
  for (const d of debtors) for (const c of creditors) { const x = Math.min(d.left, c.left); if (x >= 1) { transfers.push({ from: d.userId, to: c.userId, amount: r0(x) }); d.left -= x; c.left -= x; } }
  return { total: r0(total), method: 'proportional to income', balances: bal, transfers };
}

/* ── Estate & legacy ─────────────────────────────────────────────── */
const yearsSince = (d, today) => d ? (new Date(`${today}T00:00:00Z`) - new Date(`${String(d).slice(0, 10)}T00:00:00Z`)) / 31557600000 : null;
export function estateReadiness({ plan, beneficiaries, netWorth, dependents = 0, today }) {
  const items = [], sum = beneficiaries.reduce((s, b) => s + b.sharePct, 0), hasMinor = beneficiaries.some(b => b.minor);
  const add = (key, label, ok, advice) => items.push({ key, label, ok, advice: ok ? null : advice });
  add('will', 'A written will exists', !!plan.willExists, 'Without a will, succession follows personal law and can be slow and contested. A lawyer can draft one.');
  const wy = yearsSince(plan.willUpdatedOn, today);
  if (plan.willExists) add('will_fresh', 'Will reviewed in the last 5 years', wy != null && wy <= 5, 'Review your will after any major life event or every few years.');
  add('beneficiaries', 'Beneficiaries recorded and shares total 100%', beneficiaries.length > 0 && Math.abs(sum - 100) < 0.01, beneficiaries.length ? `Shares currently total ${sum}%; they should total 100%.` : 'Record who should inherit what.');
  const ny = yearsSince(plan.nomineesUpdatedOn, today);
  add('nominees', 'Bank, investment and insurance nominees checked in the last 3 years', ny != null && ny <= 3, 'Nominees on accounts and policies should match your wishes. A nominee is not always the legal heir, so a will still matters.');
  if (hasMinor || dependents > 0) add('guardian', 'Guardian named for minors', !!plan.guardianNamed, 'Name who would care for dependent children, in your will.');
  add('poa', 'Power of attorney considered', !!plan.powerOfAttorney, 'Consider who could act for you if you became unable to manage your affairs.');
  const done = items.filter(i => i.ok).length, score = r0((done / items.length) * 100);
  return {
    score, items, estateValue: r0(netWorth),
    explain: explain({ title: 'Estate readiness', verdict: `${done} of ${items.length} basics in place`, why: items.map(i => `${i.ok ? '✓' : '✗'} ${i.label}`), inputs: { netWorth: r0(netWorth), beneficiaries: beneficiaries.length }, risks: ['Succession law depends on religion, state and the type of asset.', 'This checklist is not legal advice.'], alternatives: ['Speak to a lawyer or estate planner about wills and trusts.'], confidence: 0.7, uncertainty: 'Only reflects what you have told us.' }),
  };
}
export function transferModel({ estateValue, beneficiaries }) {
  return {
    distribution: beneficiaries.map(b => ({ name: b.name, relation: b.relation, sharePct: b.sharePct, amount: r0((estateValue * b.sharePct) / 100) })),
    notes: ['India currently has no inheritance or estate tax. Capital gains and clubbing rules can apply when assets are transferred or gifted.', 'Gifts to specified relatives are generally exempt, but income from assets gifted to a spouse or minor child can be clubbed with yours. Confirm with a CA.', 'Illiquid assets such as property or private holdings may not split evenly. Plan who gets what, not just percentages.'],
  };
}

/* ── Private, global & real-estate assets ────────────────────────── */
const ILLIQUID = new Set(['property', 'pe_vc', 'startup', 'art', 'collectible', 'p2p']);
export function privateAssetView(a, today) {
  const value = a.currentValue * a.fxRate, invested = a.invested * a.fxRate, years = Math.max(0.1, yearsSince(a.startDate, today));
  const illiquid = ILLIQUID.has(a.kind) || (a.lockinUntil && a.lockinUntil > today);
  const v = { ...a, valueBase: r0(value), investedBase: r0(invested), gain: r0(value - invested), cagr: invested > 0 && years >= 1 ? Math.round((Math.pow(value / invested, 1 / years) - 1) * 1000) / 1000 : null, illiquid: !!illiquid };
  if (a.kind === 'property') {
    const income = a.monthlyIncome * 12 * a.fxRate, costs = a.annualCosts * a.fxRate, loan = a.loanOutstanding * a.fxRate;
    v.property = { equity: r0(value - loan), grossYield: value > 0 ? Math.round((income / value) * 10000) / 10000 : null, netYield: value > 0 ? Math.round(((income - costs) / value) * 10000) / 10000 : null, priceToRent: income > 0 ? Math.round((value / income) * 10) / 10 : null };
  }
  return v;
}
export function privateSummary(assets, today) {
  const views = assets.map(a => privateAssetView(a, today)), total = views.reduce((s, v) => s + v.valueBase, 0), ill = views.filter(v => v.illiquid).reduce((s, v) => s + v.valueBase, 0);
  const group = f => Object.entries(views.reduce((m, v) => ({ ...m, [f(v)]: (m[f(v)] ?? 0) + v.valueBase }), {})).map(([k, amount]) => ({ key: k, amount, share: total ? Math.round((amount / total) * 100) / 100 : 0 }));
  const props = views.filter(v => v.property);
  const warnings = [];
  if (total && ill / total > 0.6) warnings.push('More than 60% of these assets are hard to sell quickly.');
  props.filter(p => (p.property.netYield ?? 1) < 0.02).forEach(p => warnings.push(`${p.name}: net rental yield is under 2%, below what a safe fixed deposit pays.`));
  views.filter(v => v.currency !== 'INR' && v.fxRate === 1).forEach(v => warnings.push(`${v.name}: foreign-currency asset with exchange rate 1. Update the rate for a true value.`));
  return { views, total: r0(total), illiquid: r0(ill), illiquidShare: total ? Math.round((ill / total) * 100) / 100 : 0, byKind: group(v => v.kind), byCurrency: group(v => v.currency), warnings, note: 'Values and exchange rates are the ones you entered. FinAura does not value private assets.' };
}

/* ── ESG ─────────────────────────────────────────────────────────── */
export function esgView({ positions, ratings }) {
  const byS = new Map(ratings.map(r => [r.symbol, r])), rated = [], excludedHeld = [];
  let covered = 0;
  for (const p of positions) {
    const r = byS.get(p.symbol); if (!r) continue;
    if (r.excluded) excludedHeld.push({ symbol: p.symbol, weight: p.weight });
    const sc = [r.e, r.s, r.g].filter(x => x != null); if (!sc.length) continue;
    rated.push({ symbol: p.symbol, weight: p.weight, score: sc.reduce((s, x) => s + x, 0) / sc.length, e: r.e, s: r.s, g: r.g }); covered += p.weight;
  }
  const wavg = k => { const rs = rated.filter(r => r[k] != null), w = rs.reduce((s, r) => s + r.weight, 0); return w ? r0(rs.reduce((s, r) => s + r[k] * r.weight, 0) / w) : null; };
  return { score: covered ? r0(rated.reduce((s, r) => s + r.score * r.weight, 0) / covered) : null, e: wavg('e'), s: wavg('s'), g: wavg('g'), coverage: Math.round(Math.min(1, covered) * 100) / 100, laggards: [...rated].sort((a, b) => a.score - b.score).slice(0, 3).map(r => ({ symbol: r.symbol, score: r0(r.score) })), excludedHeld, note: 'ESG scores are entered by you from a provider you trust. FinAura does not rate companies and ESG ratings differ widely between providers.' };
}

/* ── Investor psychology lab ─────────────────────────────────────── */
export const BIASES = { loss_aversion: 'Loss aversion', herd: 'Herd behaviour', confirmation: 'Confirmation bias', overconfidence: 'Overconfidence', recency: 'Recency bias', fomo: 'FOMO' };
export const EXERCISES = [
  { id: 'la1', bias: 'loss_aversion', q: 'You bought a stock at ₹100. It is now ₹70 and nothing about the business has changed. A friend says "just wait till it is back at ₹100 so you do not lose". The best way to think about it?', options: ['Wait for ₹100 so the loss is never real', 'Ask whether you would buy it today at ₹70, and decide on that', 'Sell now to stop the pain'], answer: 1, why: 'The price you paid is gone. Judge it as if you were buying today, not as a way to avoid admitting a loss.' },
  { id: 'la2', bias: 'loss_aversion', q: 'Option A: a sure ₹50,000 gain. Option B: 50% chance of ₹1,20,000, 50% chance of nothing. Most people take A. What is the expected value of B?', options: ['₹50,000', '₹60,000', '₹1,20,000'], answer: 1, why: 'B has a higher expected value (₹60,000), but taking A can still be reasonable if you cannot afford the risk. The bias is not noticing the trade-off.' },
  { id: 'hd1', bias: 'herd', q: 'Everyone in your group chat is buying a coin that rose 80% this month. What is the most useful first question?', options: ['How do I buy before it goes higher?', 'What do I understand about it that the crowd might not, and what is my exit plan?', 'How much can I put in right now?'], answer: 1, why: 'Crowds are often loudest near peaks. Having your own reasoning and exit rule is the antidote.' },
  { id: 'hd2', bias: 'herd', q: 'A fund has had record inflows after a great year. This tells you:', options: ['It will keep outperforming', 'People are chasing past returns, which says little about future ones', 'It is safe'], answer: 1, why: 'Past performance and popularity do not predict returns; inflows often follow good performance rather than cause more.' },
  { id: 'cf1', bias: 'confirmation', q: 'You own a stock and love it. How should you research it?', options: ['Read bullish analyses to feel confident', 'Actively look for the strongest bearish case', 'Ask friends who also own it'], answer: 1, why: 'Seeking out the best argument against your view is how you catch what you are missing.' },
  { id: 'cf2', bias: 'confirmation', q: 'New data contradicts your investment thesis. A healthy response is to:', options: ['Explain it away as noise', 'Write down what evidence would change your mind, then check against it', 'Stop reading the news'], answer: 1, why: 'Deciding in advance what would change your mind makes it harder to rationalise.' },
  { id: 'oc1', bias: 'overconfidence', q: 'You made three good trades in a row. The sensible reading is:', options: ['I have an edge, so size up', 'A short streak is weak evidence; keep position sizes the same', 'Trade more often'], answer: 1, why: 'Short winning streaks are common by luck. Over-trading after wins is a classic drag on returns.' },
  { id: 'oc2', bias: 'overconfidence', q: 'You estimate a 90% range for next year\'s market return. How wide should it be?', options: ['A few percentage points', 'Very wide, tens of percentage points', 'Exactly the historical average'], answer: 1, why: 'Annual market returns vary hugely. Narrow ranges signal overconfidence.' },
  { id: 'rc1', bias: 'recency', q: 'Markets rose for 18 months. Your plan assumed 10% a year. Do you change it to 20%?', options: ['Yes, the trend is clear', 'No, plan on long-run assumptions and treat recent returns as one data point', 'Move everything to equity'], answer: 1, why: 'Extrapolating the recent past is how people buy high and sell low.' },
  { id: 'rc2', bias: 'recency', q: 'Markets fell 15% last month. Your goal is 15 years away. The usual advice for your plan is to:', options: ['Stop your SIP until it recovers', 'Keep investing on schedule, since you are buying cheaper', 'Sell and re-enter later'], answer: 1, why: 'For long horizons, steady investing through falls is generally what plans assume. If you need the money soon, that is a different question.' },
  { id: 'fm1', bias: 'fomo', q: 'You missed a big rally. What is a sound response?', options: ['Buy now so you do not miss more', 'Stay with your plan and allocation; add only via your regular schedule', 'Borrow to catch up'], answer: 1, why: 'Chasing after you have missed a move often means buying near a high.' },
  { id: 'fm2', bias: 'fomo', q: 'Before putting money into something trending, a good rule is:', options: ['Decide the position size and exit before buying, and sleep on it', 'Buy a little and decide later', 'Use all your emergency fund so it counts'], answer: 0, why: 'Deciding size and exit up front, with a pause, filters out impulse trades.' },
];
export const publicExercises = () => EXERCISES.map(({ answer, why, ...e }) => e);
export function biasProfile(results, patterns = []) {
  const by = {};
  for (const r of results) { (by[r.bias] ??= { n: 0, ok: 0 }); by[r.bias].n++; if (r.correct) by[r.bias].ok++; }
  const rows = Object.entries(BIASES).map(([k, label]) => { const t = by[k]; return { bias: k, label, answered: t?.n ?? 0, accuracy: t ? Math.round((t.ok / t.n) * 100) : null }; });
  const weak = rows.filter(r => r.accuracy != null && r.accuracy < 100).map(r => r.label);
  return { rows, weak, fromTrades: patterns.filter(p => p.severity === 'concern' || p.severity === 'watch').map(p => ({ label: p.label, detail: p.detail })), note: 'Exercise answers show awareness of a bias, not how you will behave under real pressure. The trade-based flags come from your actual logged trades.' };
}

/* ── Learn IQ ────────────────────────────────────────────────────── */
export const LESSONS = [
  { id: 'emergency', title: 'Your emergency fund', topic: 'emergency', minutes: 4, body: ['An emergency fund covers essential costs if income stops or a surprise bill arrives. Most planners suggest 3–6 months of expenses, and more if your income is irregular or you have dependents.', 'Keep it in something you can reach in a day or two, such as a savings account, a liquid fund or a short fixed deposit. Its job is safety, not return.'], quiz: { q: 'Where should an emergency fund sit?', options: ['In small-cap stocks', 'In easily accessible, low-risk places', 'In a locked 10-year plan'], answer: 1 } },
  { id: 'compounding', title: 'How compounding works', topic: 'savings', minutes: 4, body: ['Compounding means you earn returns on past returns. At 10% a year, money roughly doubles in about seven years (the rule of 72: 72 divided by the rate).', 'Time matters more than size: starting ten years earlier usually beats saving noticeably more later.'], quiz: { q: 'At about 8% a year, roughly how long to double money (rule of 72)?', options: ['4 years', '9 years', '15 years'], answer: 1 } },
  { id: 'debt', title: 'Which debt to clear first', topic: 'debt', minutes: 4, body: ['Interest rates differ a lot. Credit cards often charge 36–42% a year, personal loans 11–20%, home loans much less.', 'Clearing the highest-rate debt first (the avalanche method) costs least in interest. Clearing the smallest balance first (snowball) costs a bit more but some people stay motivated.'], quiz: { q: 'Which strategy minimises total interest?', options: ['Smallest balance first', 'Highest interest rate first', 'Oldest loan first'], answer: 1 } },
  { id: 'insurance', title: 'Insurance basics', topic: 'insurance', minutes: 5, body: ['Insurance is for risks you cannot afford, not for investment. Pure term cover and adequate health cover are the usual starting points.', 'A common rule of thumb for life cover is 10–15 times annual income if others depend on you. Mixing insurance with investment in one product usually makes both worse.'], quiz: { q: 'What is the main job of term insurance?', options: ['Build wealth', 'Replace income for dependents if you die', 'Save tax only'], answer: 1 } },
  { id: 'diversification', title: 'Diversification', topic: 'diversification', minutes: 4, body: ['Diversification means not depending on one outcome. Spread across asset classes (equity, debt, gold, cash) and within them.', 'It will not stop losses in a broad crash, but it reduces the chance that one bad holding derails your plan.'], quiz: { q: 'Diversification mainly reduces…', options: ['All market risk', 'The damage from any single holding', 'Taxes'], answer: 1 } },
  { id: 'retirement', title: 'Planning for retirement', topic: 'retirement', minutes: 5, body: ['Estimate yearly spending at retirement, adjust for inflation until then, and work out the corpus that can fund it for a long life. Many plans use a 3–4% yearly withdrawal as a rough guide.', 'Inflation is the quiet risk: at 6%, costs double in about twelve years.'], quiz: { q: 'Why does inflation matter for retirement?', options: ['It makes future costs higher', 'It lowers taxes', 'It only affects the rich'], answer: 0 } },
  { id: 'tax', title: 'Old vs new tax regime', topic: 'savings', minutes: 4, body: ['The new regime has lower slab rates but few deductions. The old regime has higher rates but lets you claim deductions like 80C, health insurance and home-loan interest.', 'Which is better depends on how many deductions you actually use. Compare both each year.'], quiz: { q: 'The better regime depends mainly on…', options: ['Your age only', 'How many deductions you claim', 'Your city'], answer: 1 } },
  { id: 'behaviour', title: 'Your mind and your money', topic: 'behaviour', minutes: 5, body: ['Most investing mistakes are behavioural: selling in panic, buying after a run-up, following the crowd. Knowing the pattern helps you spot it in yourself.', 'Useful habits: automate investing, write down why you bought, set a pause before large trades, and review on a schedule instead of daily.'], quiz: { q: 'A helpful habit to avoid impulse trades is…', options: ['Checking prices hourly', 'Pausing before large trades', 'Following social media tips'], answer: 1 } },
];
export const publicLessons = () => LESSONS.map(l => ({ id: l.id, title: l.title, topic: l.topic, minutes: l.minutes }));
export const nextLessons = (done, weakest) => LESSONS.filter(l => !done.has(l.id)).sort((a, b) => (b.topic === weakest) - (a.topic === weakest)).slice(0, 3).map(l => ({ id: l.id, title: l.title, topic: l.topic, reason: l.topic === weakest ? 'Matches your weakest wellness area' : 'Next in the curriculum' }));

/* ── Life-event planner ──────────────────────────────────────────── */
export const LIFE_EVENTS = {
  marriage: { label: 'Getting married', checklist: ['Agree how to share expenses and decide on joint vs separate accounts', 'Update nominees and beneficiaries', 'Review health cover for a spouse', 'Review life cover and consider a will'], scenarios: ['expense_change'] },
  child: { label: 'Having a child', checklist: ['Add the child to health insurance and check maternity cover', 'Increase term cover and name a guardian in your will', 'Start a separate education goal and SIP', 'Re-check your emergency fund target'], scenarios: ['expense_change', 'invest_monthly'] },
  home: { label: 'Buying a home', checklist: ['Keep EMIs under about 35–40% of income, including existing loans', 'Plan the down payment and keep the emergency fund intact', 'Account for stamp duty, registration and fit-out', 'Check home-loan insurance and your term cover'], scenarios: ['buy_home'] },
  job_change: { label: 'Changing or losing a job', checklist: ['Build or top up the emergency fund first', 'Check health insurance continuity', 'Review ESOP, PF and notice-period terms', 'Delay big purchases'], scenarios: ['job_loss', 'income_change'] },
  relocation: { label: 'Moving cities or abroad', checklist: ['Update the address on bank, KYC and insurance', 'Check tax residency rules if moving abroad', 'Plan one-off moving costs'], scenarios: ['expense_change'] },
  parent_care: { label: 'Caring for parents', checklist: ['Check parents’ health cover', 'Plan a monthly support amount and a medical reserve', 'Discuss wills and nominees with them'], scenarios: ['expense_change'] },
  education: { label: 'Higher education', checklist: ['Compare education loan rates and the moratorium', 'Plan living costs and currency risk if abroad', 'Check tax benefits on education loan interest'], scenarios: ['expense_change', 'windfall'] },
  retirement: { label: 'Retiring', checklist: ['Confirm your corpus lasts with the life-model simulation', 'Plan a safe-withdrawal and bucket strategy', 'Review health cover and the estate plan'], scenarios: ['retire_early'] },
};
export const publicLifeEvents = () => Object.entries(LIFE_EVENTS).map(([kind, e]) => ({ kind, label: e.label }));

/* ── Co-Pilot: proposals only ────────────────────────────────────── */
export function proposeTasks({ wellness, emergency, insurance, loans, estate, concentration, diversified }) {
  const out = [];
  const add = (key, title, why, steps, impact, risks) => out.push({ key, title, detail: { why, steps, impact, requiresYourApproval: true, explain: explain({ title, verdict: 'Proposed, needs your approval', why, inputs: {}, risks: risks ?? ['Based only on the data you entered.'], alternatives: ['Dismiss it, or discuss with a human adviser first.'], confidence: 0.65, uncertainty: 'FinAura never moves money or changes accounts. You carry out any step yourself.' }) } });
  if (emergency?.ready && emergency.gap > 0) add('emergency_gap', 'Top up your emergency fund', [`You hold ${emergency.coverageMonths.toFixed(1)} months against a ${emergency.targetMonths}-month target.`], [`Set aside about ${Math.round(emergency.gap).toLocaleString('en-IN')} in a liquid account`, 'Automate a monthly transfer until the gap closes'], 'Reduces the risk of selling investments or borrowing in a crisis.');
  const hi = (loans ?? []).filter(l => l.highInterest);
  if (hi.length) add('high_interest_debt', 'Pay down high-interest debt first', [`${hi.map(l => l.name).join(', ')} charge${hi.length === 1 ? 's' : ''} 15% or more.`], ['Pay at least the minimum on all loans', 'Direct spare cash to the highest-rate loan', 'Check whether a cheaper balance transfer exists (see Credit IQ)'], 'Interest saved is a guaranteed return at the loan rate.');
  (insurance?.gaps ?? []).filter(g => g.gap > 0).forEach(g => add(`insurance_${g.kind}`, `Close the ${g.kind} cover gap`, [`Your ${g.kind} cover is short by about ${Math.round(g.gap).toLocaleString('en-IN')}.`], ['Compare policies in Insurance IQ', 'Prefer pure term cover for life', 'Consider speaking to a licensed insurance adviser'], 'Protects dependants and your savings from a major event.'));
  if (estate && estate.score < 60) add('estate_basics', 'Put estate basics in place', estate.items.filter(i => !i.ok).slice(0, 3).map(i => i.label), ['Open the Estate section and record beneficiaries', 'Speak to a lawyer about a will'], 'Makes succession simpler for your family.');
  if (concentration) add('concentration', 'Reduce concentration in one holding', [`${concentration.symbol} is ${Math.round(concentration.weight * 100)}% of your market portfolio.`], ['Direct new money elsewhere before selling', 'If you sell, consider tax first (see Tax IQ harvesting)'], 'Reduces the damage if one company disappoints.');
  if (diversified === false) add('diversify', 'Broaden your asset mix', ['Your diversification score is low.'], ['Check the rebalance suggestions in Planning', 'Add the groups you hold least of with new money'], 'A more balanced mix usually means smoother outcomes.');
  if (wellness?.ready && wellness.score >= 80 && !out.length) add('all_good', 'Review your plan once a year', [`Your wellness score is ${wellness.score}/100.`], ['Re-run the What-if simulator for a market fall', 'Re-check nominees and cover'], 'Keeps a good position good.');
  return out;
}

/* ── Fraud awareness ─────────────────────────────────────────────── */
export const FRAUD_TIPS = ['No bank, exchange or government office will ask for your OTP, PIN or full card details.', 'Be wary of guaranteed returns, "double your money" schemes and tips from strangers on social apps.', 'Check any adviser on the regulator’s official register before paying or sharing data.', 'Never install screen-sharing apps at the request of someone claiming to be support.', 'Urgency is a red flag. Take time, and verify through an official number you looked up yourself.'];
const SCAM = [/lottery|prize|lucky draw|winner/i, /kyc\s*(update|expire|verify)/i, /refund\s*(link|claim)|cashback\s*claim/i, /double\s*(your)?\s*money|guaranteed\s*return/i, /\botp\b/i];
export function detectFraudRisk(txns) {
  const flags = [], debits = txns.filter(t => t.direction === 'debit' || t.direction === 'out');
  const med = median(debits.map(t => t.amount)) ?? 0;
  for (const t of txns) { const text = `${t.merchant ?? ''} ${t.description ?? ''}`; if (SCAM.some(re => re.test(text))) flags.push({ type: 'scam_wording', day: t.day, amount: t.amount, detail: 'Description contains wording often used in scams.', merchant: t.merchant }); }
  const seen = {}; debits.forEach(t => { const k = (t.merchant ?? t.description ?? '').toLowerCase(); (seen[k] ??= []).push(t); });
  for (const [k, ts] of Object.entries(seen)) {
    if (ts.length === 1 && med > 0 && ts[0].amount >= med * 8 && ts[0].amount >= 10000) flags.push({ type: 'large_new_payee', day: ts[0].day, amount: ts[0].amount, detail: 'Large payment to a payee you have not paid before.', merchant: ts[0].merchant });
    const byDay = {}; ts.forEach(t => { byDay[t.day] = (byDay[t.day] ?? 0) + 1; });
    for (const [d, n] of Object.entries(byDay)) if (n >= 3 && k) flags.push({ type: 'repeated_same_day', day: d, amount: ts.filter(t => t.day === d).reduce((s, t) => s + t.amount, 0), detail: `${n} payments to the same payee in one day.`, merchant: ts[0].merchant });
  }
  return { flags, checked: txns.length, tips: FRAUD_TIPS, note: 'Heuristic checks on your own transactions. A flag is a prompt to look, not proof of fraud. If you suspect fraud, contact your bank immediately and report on the national cybercrime portal.' };
}

/* ── Document intelligence (offline fallback) ────────────────────── */
export function regexExtract(text) {
  const money = [...text.matchAll(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/gi)].map(m => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite);
  const dates = [...new Set([...text.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/g)].map(m => m[1]))].slice(0, 10);
  return { amounts: money.slice(0, 15), dates, note: 'Basic pattern extraction only. Add a GROQ_API_KEY for structured field extraction.' };
}
export const CLAIM_CHECKLIST = {
  health: ['Policy number and insurer helpline', 'Hospital discharge summary and final bill', 'All prescriptions, test reports and payment receipts', 'Pre-authorisation approval (cashless) or claim form (reimbursement)', 'KYC and bank details for reimbursement', 'Intimate the insurer within the time stated in your policy'],
  life: ['Original policy document', 'Death certificate', 'Claimant ID and relationship proof', 'Nominee bank details', 'Medical and hospital records if relevant'],
  motor: ['FIR for theft or major damage if required', 'Photos of damage', 'RC, driving licence and policy copy', 'Repair estimate and invoices', 'Intimate the insurer promptly'],
};
