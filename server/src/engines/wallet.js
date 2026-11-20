import { diffDays, monthKey, addDays } from '../lib/dates.js';
import { explain } from '../lib/explain.js';

export const CATEGORIES = ['Salary', 'Other income', 'Rent', 'Groceries', 'Food & dining', 'Transport', 'Shopping', 'Bills & utilities', 'EMI & loans', 'Subscriptions', 'Entertainment', 'Health', 'Education', 'Travel', 'Insurance', 'Investments', 'Transfers', 'Other'];
const FIXED = new Set(['Rent', 'EMI & loans', 'Insurance', 'Subscriptions', 'Bills & utilities', 'Education']);
const r2 = n => Math.round(n * 100) / 100;

const RULES = [
  ['Salary', /\b(salary|payroll|stipend|wages)\b/i],
  ['Rent', /\b(rent|landlord|housing society|maintenance charges)\b/i],
  ['EMI & loans', /\b(emi|loan|nach|mortgage|credit card bill|cc payment)\b/i],
  ['Insurance', /\b(insurance|premium|lic\b|policybazaar|star health|hdfc ergo|icici lombard)\b/i],
  ['Investments', /\b(sip|mutual fund|zerodha|groww|upstox|kuvera|coin|nps|ppf|demat|stocks?)\b/i],
  ['Subscriptions', /\b(netflix|spotify|prime video|hotstar|youtube premium|apple\.com|icloud|google one|chatgpt|openai|notion|adobe|microsoft 365|jiosaavn|zee5|sonyliv)\b/i],
  ['Groceries', /\b(bigbasket|blinkit|zepto|dmart|grofers|instamart|grocery|supermarket|reliance fresh|more retail)\b/i],
  ['Food & dining', /\b(swiggy|zomato|restaurant|cafe|dominos|mcdonald|kfc|starbucks|pizza|bakery|dining)\b/i],
  ['Transport', /\b(uber|ola|rapido|metro|irctc|fuel|petrol|diesel|hpcl|bpcl|iocl|fastag|parking|cab)\b/i],
  ['Travel', /\b(makemytrip|goibibo|indigo|air india|vistara|airbnb|oyo|booking\.com|hotel|cleartrip)\b/i],
  ['Bills & utilities', /\b(electricity|bescom|msedcl|water bill|broadband|airtel|jio|vodafone|vi\b|gas|piped gas|recharge|bsnl|dth|tata play)\b/i],
  ['Health', /\b(pharmacy|apollo|medplus|1mg|netmeds|hospital|clinic|diagnostic|lab|doctor|dental)\b/i],
  ['Education', /\b(tuition|school|college|course|udemy|coursera|byju|unacademy|fees|exam)\b/i],
  ['Entertainment', /\b(bookmyshow|pvr|inox|cinema|game|steam|playstation|concert)\b/i],
  ['Shopping', /\b(amazon|flipkart|myntra|ajio|nykaa|meesho|croma|decathlon|ikea|shopping)\b/i],
];
export function categorize(description = '', merchant = '', direction = 'out') {
  const text = `${merchant} ${description}`;
  for (const [cat, re] of RULES) if (re.test(text)) return direction === 'in' && cat !== 'Salary' ? 'Other income' : cat;
  if (direction === 'in') return /\b(refund|interest|dividend|cashback|reward)\b/i.test(text) ? 'Other income' : /\b(upi|neft|imps|transfer)\b/i.test(text) ? 'Transfers' : 'Other income';
  return /\b(upi|neft|imps|transfer|self)\b/i.test(text) ? 'Transfers' : 'Other';
}

const norm = t => ({ ...t, amount: Number(t.amount), day: String(t.day).slice(0, 10) });
const isIncome = t => t.direction === 'in' && t.category !== 'Transfers';
const isSpend = t => t.direction === 'out' && !['Transfers', 'Investments'].includes(t.category);

export function monthlySummary(txns) {
  const months = {};
  for (const raw of txns) {
    const t = norm(raw), k = monthKey(t.day);
    const m = (months[k] ??= { month: k, income: 0, spend: 0, invested: 0, byCategory: {} });
    if (isIncome(t)) m.income += t.amount;
    else if (isSpend(t)) { m.spend += t.amount; m.byCategory[t.category] = (m.byCategory[t.category] ?? 0) + t.amount; }
    else if (t.direction === 'out' && t.category === 'Investments') m.invested += t.amount;
  }
  return Object.values(months).sort((a, b) => (a.month < b.month ? -1 : 1)).map(m => ({ ...m, income: r2(m.income), spend: r2(m.spend), invested: r2(m.invested), savings: r2(m.income - m.spend), savingsRate: m.income ? r2((m.income - m.spend) / m.income) : null }));
}

/** Cash-flow analysis over recent full months + savings optimisation hints. */
export function cashflowAnalysis(txns, today) {
  const all = monthlySummary(txns), cur = monthKey(today);
  const full = all.filter(m => m.month < cur).slice(-3), thisMonth = all.find(m => m.month === cur) ?? null;
  if (!full.length) return { ready: false, months: all, thisMonth, note: 'Add at least one full month of transactions for analysis.' };
  const avg = k => full.reduce((s, m) => s + m[k], 0) / full.length;
  const income = avg('income'), spend = avg('spend');
  const cats = {};
  full.forEach(m => Object.entries(m.byCategory).forEach(([c, v]) => { cats[c] = (cats[c] ?? 0) + v / full.length; }));
  const categories = Object.entries(cats).map(([category, amount]) => ({ category, amount: r2(amount), share: spend ? r2(amount / spend) : 0, fixed: FIXED.has(category) })).sort((a, b) => b.amount - a.amount);
  const fixedTotal = categories.filter(c => c.fixed).reduce((s, c) => s + c.amount, 0);
  const rate = income ? (income - spend) / income : null;
  const tips = [];
  const disc = categories.filter(c => !c.fixed && ['Food & dining', 'Shopping', 'Entertainment', 'Travel'].includes(c.category));
  for (const c of disc) if (income && c.amount / income > 0.12) tips.push({ category: c.category, monthlySavingIfTrim20: r2(c.amount * 0.2), note: `${c.category} is ${Math.round(c.amount / income * 100)}% of income; trimming a fifth would free ${r2(c.amount * 0.2).toLocaleString('en-IN')} a month.` });
  if (rate != null && rate < 0.2) tips.push({ category: 'Savings rate', note: `You save ${Math.round(rate * 100)}% of income; many planners aim for at least 20%.` });
  if (income && fixedTotal / income > 0.6) tips.push({ category: 'Fixed costs', note: `Fixed commitments take ${Math.round(fixedTotal / income * 100)}% of income, which leaves little room to adapt.` });
  const trend = full.length >= 2 ? r2(full.at(-1).spend - full[0].spend) : 0;
  return {
    ready: true, monthsUsed: full.length, avgIncome: r2(income), avgSpend: r2(spend), avgSavings: r2(income - spend), savingsRate: rate == null ? null : r2(rate),
    fixedShare: spend ? r2(fixedTotal / spend) : 0, categories, spendTrend: trend, projectedNextMonthSpend: r2(spend + trend / Math.max(1, full.length - 1) * 0.5),
    thisMonth, months: all.slice(-12), tips,
    explain: explain({
      title: 'Cash-flow health', verdict: rate == null ? 'No income recorded, so a savings rate cannot be computed.' : `You keep about ${Math.round(rate * 100)}% of what you earn.`,
      why: [`Average of the last ${full.length} full month(s): income ${r2(income).toLocaleString('en-IN')}, spending ${r2(spend).toLocaleString('en-IN')}.`, `${Math.round((spend ? fixedTotal / spend : 0) * 100)}% of spending is fixed (rent, EMIs, bills, insurance).`],
      inputs: { months: full.map(m => m.month), transactions: txns.length }, risks: ['Irregular income makes averages misleading.', 'Uncategorised spending hides the real picture; check the "Other" bucket.'],
      alternatives: ['Automate savings on payday.', 'Set category budgets for the top two discretionary categories.'], confidence: full.length >= 3 ? 0.7 : 0.45,
      uncertainty: full.length < 3 ? 'Fewer than three months of data; patterns may not be representative.' : 'Seasonal spending (festivals, travel) can shift next month.',
    }),
  };
}

const merchantKey = t => (t.merchant || t.description || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 14);

/** Recurring payments: same payee, near-same amount, regular gap. */
export function detectSubscriptions(txns, today) {
  const groups = new Map();
  for (const raw of txns.map(norm).filter(t => t.direction === 'out')) { const k = merchantKey(raw); if (k.length >= 3) (groups.get(k) ?? groups.set(k, []).get(k)).push(raw); }
  const out = [];
  for (const [, g] of groups) {
    g.sort((a, b) => (a.day < b.day ? -1 : 1));
    if (g.length < 3) continue;
    const gaps = g.slice(1).map((t, i) => diffDays(t.day, g[i].day));
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const cadence = med >= 25 && med <= 35 ? 'monthly' : med >= 6 && med <= 8 ? 'weekly' : med >= 85 && med <= 95 ? 'quarterly' : med >= 355 && med <= 375 ? 'yearly' : null;
    if (!cadence) continue;
    const regular = gaps.filter(x => Math.abs(x - med) <= Math.max(3, med * 0.15)).length / gaps.length;
    const amts = g.map(t => t.amount), last = g.at(-1), prev = g.at(-2);
    const medAmt = [...amts].sort((a, b) => a - b)[Math.floor(amts.length / 2)];
    const stable = amts.filter(a => Math.abs(a - medAmt) / medAmt <= 0.1).length / amts.length;
    if (regular < 0.7 || stable < 0.6) continue;
    const next = addDays(last.day, med);
    const perYear = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[cadence];
    out.push({
      name: last.merchant || last.description, cadence, amount: last.amount, annualCost: r2(last.amount * perYear), category: last.category,
      lastPaid: last.day, nextDue: next, daysUntilDue: diffDays(next, today), overdue: diffDays(next, today) < -5,
      priceIncrease: last.amount > prev.amount * 1.05 ? { from: prev.amount, to: last.amount } : null, occurrences: g.length,
    });
  }
  out.sort((a, b) => b.annualCost - a.annualCost);
  return { subscriptions: out, monthlyTotal: r2(out.reduce((s, x) => s + x.annualCost / 12, 0)), annualTotal: r2(out.reduce((s, x) => s + x.annualCost, 0)), upcoming: out.filter(x => x.daysUntilDue >= 0 && x.daysUntilDue <= 7) };
}

const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

/** Unusual activity in the user's own cash records. Flags for review, never accuses. */
export function detectAnomalies(txns, today, subscriptions = []) {
  const ts = txns.map(norm), found = [];
  const subNames = new Set(subscriptions.map(s => s.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)));
  const mk = (type, severity, t, title, detail, extra = {}) => found.push({ type, severity, day: t.day, amount: t.amount, merchant: t.merchant ?? null, ids: [t.id].filter(Boolean), ...extra,
    explain: explain({ title, verdict: detail, why: [detail], inputs: { day: t.day, amount: t.amount, merchant: t.merchant }, risks: ['This is a statistical flag, not proof of fraud or error.'], alternatives: ['Mark as expected if you recognise it.', 'If you do not recognise it, contact your bank and review card limits.'], confidence: severity === 'high' ? 0.7 : 0.5, uncertainty: 'Based only on the transactions you added.' }) });

  // 1. Duplicates: same payee + amount within two days (not a known subscription)
  const seen = new Map();
  for (const t of ts.filter(x => x.direction === 'out' && x.amount >= 100)) {
    const k = `${merchantKey(t)}|${t.amount}`;
    const prev = seen.get(k);
    if (prev && Math.abs(diffDays(t.day, prev.day)) <= 2 && !subNames.has(merchantKey(t))) mk('duplicate', 'medium', t, 'Possible duplicate payment', `Two payments of ${t.amount.toLocaleString('en-IN')} to ${t.merchant ?? 'the same payee'} within two days.`, { ids: [prev.id, t.id].filter(Boolean) });
    seen.set(k, t);
  }
  // 2. Spend spike by category vs history
  const sums = monthlySummary(ts), cur = monthKey(today);
  const hist = sums.filter(m => m.month < cur).slice(-6), now = sums.find(m => m.month === cur);
  if (now && hist.length >= 3) for (const [cat, v] of Object.entries(now.byCategory)) {
    const past = hist.map(m => m.byCategory[cat] ?? 0), mean = past.reduce((s, x) => s + x, 0) / past.length, s = sd(past);
    if (mean > 0 && v > mean * 1.5 && v > mean + 2 * Math.max(s, mean * 0.1) && v - mean > 1000) found.push({ type: 'spend_spike', severity: v > mean * 2.5 ? 'high' : 'medium', day: today, amount: r2(v), merchant: null, ids: [], category: cat,
      explain: explain({ title: `${cat} spending spike`, verdict: `${cat} is ${r2(v).toLocaleString('en-IN')} this month against a usual ${r2(mean).toLocaleString('en-IN')}.`, why: [`That is ${(v / mean).toFixed(1)}× your ${hist.length}-month average.`], inputs: { category: cat, thisMonth: v, average: mean }, risks: ['A planned one-off (travel, festival, repairs) will trigger this too.'], alternatives: ['Add a budget for this category.', 'Mark the one-off so it is excluded next time.'], confidence: 0.6, uncertainty: 'Month-to-date totals can look high early if a large bill landed.' }) });
  }
  // 3. Unusually large withdrawal vs your normal
  const outs = ts.filter(isSpend);
  if (outs.length >= 15) {
    const amts = outs.map(t => t.amount), med = [...amts].sort((a, b) => a - b)[Math.floor(amts.length / 2)], s = sd(amts), mean = amts.reduce((a, b) => a + b, 0) / amts.length;
    for (const t of outs.filter(x => x.day >= addDays(today, -45) && x.amount > Math.max(med * 8, mean + 3 * s) && !['Rent', 'EMI & loans', 'Insurance', 'Education', 'Travel'].includes(x.category))) mk('large_withdrawal', 'high', t, 'Unusually large payment', `${t.amount.toLocaleString('en-IN')} is about ${Math.round(t.amount / med)}× your typical payment.`);
  }
  // 4. Burst of small payments to one payee in a day (card-testing pattern)
  const byDay = new Map();
  for (const t of ts.filter(x => x.direction === 'out' && x.amount <= 200)) { const k = `${t.day}|${merchantKey(t)}`; (byDay.get(k) ?? byDay.set(k, []).get(k)).push(t); }
  for (const g of byDay.values()) if (g.length >= 4) mk('rapid_small_payments', 'high', g[0], 'Burst of small payments', `${g.length} small payments to ${g[0].merchant ?? 'one payee'} on ${g[0].day}.`, { ids: g.map(x => x.id).filter(Boolean) });
  found.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]) || (a.day < b.day ? 1 : -1));
  return found;
}

/** Portfolio concentration anomaly using the market ledger. */
export function concentrationAnomalies(positions, allocation) {
  const out = [];
  const top = positions[0];
  if (top && top.weight > 0.4) out.push({ type: 'concentration', severity: top.weight > 0.6 ? 'high' : 'medium', symbol: top.symbol, weight: r2(top.weight),
    explain: explain({ title: `${top.symbol} dominates your portfolio`, verdict: `${Math.round(top.weight * 100)}% of your market portfolio is in ${top.symbol}.`, why: ['A single holding this large makes one company’s bad news your bad news.'], inputs: { weight: top.weight }, risks: ['Trimming may realise taxable gains.'], alternatives: ['Direct new money elsewhere instead of selling.', 'Set a hard cap (for example 25%).'], confidence: 0.8, uncertainty: 'Does not include assets you have not entered.' }) });
  const cls = allocation[0];
  if (cls && cls.weight > 0.8 && allocation.length < 3) out.push({ type: 'class_concentration', severity: 'medium', group: cls.assetClass, weight: r2(cls.weight),
    explain: explain({ title: `Mostly ${cls.assetClass}`, verdict: `${Math.round(cls.weight * 100)}% of your portfolio sits in ${cls.assetClass}.`, why: ['One asset class moving against you moves almost everything.'], inputs: { weight: cls.weight }, risks: [], alternatives: ['Add a second, less correlated asset class.'], confidence: 0.75, uncertainty: '' }) });
  return out;
}

/** Budget status for the current month, with a pace projection. */
export function budgetStatus(txns, budgets, today) {
  const cur = monthKey(today), dom = Number(today.slice(8, 10)), dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const spent = {};
  for (const t of txns.map(norm).filter(x => isSpend(x) && monthKey(x.day) === cur)) spent[t.category] = (spent[t.category] ?? 0) + t.amount;
  return budgets.map(b => {
    const s = spent[b.category] ?? 0, limit = Number(b.monthly_limit ?? b.monthlyLimit), pace = s / Math.max(1, dom) * dim;
    return { category: b.category, limit, spent: r2(s), remaining: r2(limit - s), pctUsed: limit ? r2(s / limit) : null, projected: r2(pace), status: s > limit ? 'over' : pace > limit * 1.05 ? 'on_track_to_exceed' : 'ok' };
  });
}

export function parseBankCsv(rows) {
  const out = [], errors = [];
  rows.forEach((r, i) => {
    const date = (r.date || r['txn date'] || r['transaction date'] || '').slice(0, 10);
    const debit = Number(String(r.debit ?? r.withdrawal ?? '').replace(/,/g, '')), credit = Number(String(r.credit ?? r.deposit ?? '').replace(/,/g, ''));
    let amount = Number(String(r.amount ?? '').replace(/,/g, '')), direction = (r.type || r.direction || '').toLowerCase();
    if (r.debit !== undefined || r.credit !== undefined) { if (debit > 0) { amount = debit; direction = 'out'; } else if (credit > 0) { amount = credit; direction = 'in'; } }
    else if (direction.startsWith('cr') || direction === 'in') direction = 'in'; else if (direction.startsWith('d') || direction === 'out') direction = 'out'; else if (amount < 0) { direction = 'out'; amount = -amount; } else direction = 'in';
    const description = r.description || r.narration || r.particulars || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) { errors.push({ row: i + 2, reason: 'Needs date (YYYY-MM-DD) and a positive amount' }); return; }
    out.push({ day: date, amount, direction, description: description.slice(0, 200), merchant: (r.merchant || description.split(/[/-]/)[0] || '').trim().slice(0, 80) || null });
  });
  return { rows: out, errors };
}
