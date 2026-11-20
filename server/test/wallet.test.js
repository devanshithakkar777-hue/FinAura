import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { categorize, cashflowAnalysis, detectSubscriptions, detectAnomalies, concentrationAnomalies, budgetStatus, parseBankCsv, monthlySummary } from '../src/engines/wallet.js';
import { addDays, todayStr } from '../src/lib/dates.js';

const T = (day, amount, direction, category, merchant, id) => ({ id: id ?? `${day}-${amount}-${merchant}`, day, amount, direction, category, merchant, description: merchant });
const today = '2026-11-21';

function months(n, build) {
  const out = [];
  for (let i = n; i >= 1; i--) { const d = new Date(Date.UTC(2026, 10 - i, 1)); const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'); out.push(...build(`${y}-${m}`, i)); }
  return out;
}

describe('categoriser', () => {
  it('maps common merchants and keeps income and transfers apart', () => {
    expect(categorize('UPI swiggy order', 'Swiggy')).toBe('Food & dining');
    expect(categorize('Netflix.com', 'Netflix')).toBe('Subscriptions');
    expect(categorize('Salary credit', '', 'in')).toBe('Salary');
    expect(categorize('Interest credit', '', 'in')).toBe('Other income');
    expect(categorize('UPI to friend', '', 'out')).toBe('Transfers');
    expect(categorize('zzz unknown', '', 'out')).toBe('Other');
  });
});

describe('cash flow', () => {
  const txns = months(3, ym => [T(`${ym}-01`, 100000, 'in', 'Salary', 'Acme'), T(`${ym}-02`, 25000, 'out', 'Rent', 'Landlord'), T(`${ym}-10`, 20000, 'out', 'Food & dining', 'Swiggy'), T(`${ym}-12`, 15000, 'out', 'Shopping', 'Amazon'), T(`${ym}-15`, 10000, 'out', 'Investments', 'Groww')]);
  it('summarises months and excludes investments and transfers from spend', () => {
    const s = monthlySummary(txns)[0];
    expect(s.income).toBe(100000); expect(s.spend).toBe(60000); expect(s.invested).toBe(10000); expect(s.savingsRate).toBe(0.4);
  });
  it('analyses averages, shares and gives savings tips with an explanation', () => {
    const a = cashflowAnalysis(txns, today);
    expect(a.ready).toBe(true); expect(a.avgSpend).toBe(60000); expect(a.categories[0].category).toBe('Rent');
    expect(a.tips.some(t => t.category === 'Food & dining')).toBe(true);
    expect(a.explain.confidenceLabel).toBe('medium');
    expect(cashflowAnalysis([], today).ready).toBe(false);
  });
  it('tracks budgets with a pace projection', () => {
    const b = budgetStatus([T('2026-11-05', 9000, 'out', 'Shopping', 'Amazon')], [{ category: 'Shopping', monthly_limit: 10000 }], today);
    expect(b[0].spent).toBe(9000); expect(b[0].status).toBe('on_track_to_exceed');
  });
});

describe('subscriptions and anomalies', () => {
  it('finds monthly subscriptions, flags price rises and upcoming dues', () => {
    const txns = [['2026-08-25', 499], ['2026-09-25', 499], ['2026-10-25', 649]].map(([d, a]) => T(d, a, 'out', 'Subscriptions', 'Netflix'));
    const r = detectSubscriptions(txns, today);
    expect(r.subscriptions).toHaveLength(1); expect(r.subscriptions[0].cadence).toBe('monthly');
    expect(r.subscriptions[0].priceIncrease).toEqual({ from: 499, to: 649 }); expect(r.subscriptions[0].nextDue).toBe('2026-11-25');
    expect(r.upcoming).toHaveLength(1); expect(r.annualTotal).toBe(649 * 12);
    expect(detectSubscriptions([T('2026-10-01', 500, 'out', 'Other', 'Random')], today).subscriptions).toHaveLength(0);
  });
  it('flags duplicates, spend spikes, large payments and bursts — but not subscriptions', () => {
    const base = months(4, ym => [T(`${ym}-05`, 8000, 'out', 'Shopping', 'Amazon'), ...Array.from({ length: 5 }, (_, i) => T(`${ym}-${10 + i}`, 400 + i * 37, 'out', 'Food & dining', `Cafe${i}`))]);
    const spike = [T('2026-11-03', 30000, 'out', 'Shopping', 'Amazon', 'spike'), T('2026-11-10', 1999, 'out', 'Shopping', 'Croma', 'd1'), T('2026-11-11', 1999, 'out', 'Shopping', 'Croma', 'd2'),
      ...Array.from({ length: 4 }, (_, i) => T('2026-11-15', 50, 'out', 'Other', 'ShadyApp', `b${i}`)), T('2026-11-18', 450000, 'out', 'Other', 'Unknown Co', 'big')];
    const found = detectAnomalies([...base, ...spike], today, []);
    const types = found.map(f => f.type);
    expect(types).toContain('duplicate'); expect(types).toContain('spend_spike'); expect(types).toContain('rapid_small_payments'); expect(types).toContain('large_withdrawal');
    expect(found[0].severity).toBe('high'); expect(found.find(f => f.type === 'large_withdrawal').explain.risks[0]).toMatch(/not proof/);
    const subs = detectAnomalies([T('2026-11-10', 649, 'out', 'Subscriptions', 'Netflix'), T('2026-11-11', 649, 'out', 'Subscriptions', 'Netflix')], today, [{ name: 'Netflix' }]);
    expect(subs.find(x => x.type === 'duplicate')).toBeUndefined();
  });
  it('flags portfolio concentration', () => {
    const a = concentrationAnomalies([{ symbol: 'ABC', weight: 0.65 }], [{ assetClass: 'equity', weight: 0.9 }]);
    expect(a.map(x => x.type)).toEqual(['concentration', 'class_concentration']); expect(a[0].severity).toBe('high');
    expect(concentrationAnomalies([{ symbol: 'A', weight: 0.2 }], [{ assetClass: 'equity', weight: 0.5 }, { assetClass: 'bond', weight: 0.5 }])).toEqual([]);
  });
});

describe('bank CSV parsing', () => {
  it('handles debit/credit columns and signed amounts, and reports bad rows', () => {
    const a = parseBankCsv([{ date: '2026-10-01', description: 'UPI/Swiggy/order', debit: '1,250.50', credit: '' }, { date: '2026-10-02', description: 'Salary', debit: '', credit: '90000' }, { date: 'bad', description: 'x', debit: '5' }]);
    expect(a.rows).toHaveLength(2); expect(a.rows[0]).toMatchObject({ amount: 1250.5, direction: 'out', merchant: 'UPI' }); expect(a.rows[1].direction).toBe('in'); expect(a.errors).toHaveLength(1);
    expect(parseBankCsv([{ date: '2026-10-03', description: 'x', amount: '-300' }]).rows[0]).toMatchObject({ amount: 300, direction: 'out' });
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('wallet API', () => {
  it('adds, auto-categorises, edits, imports, analyses and isolates', async () => {
    const { c } = await newUser(app);
    const t = await c.post('/api/cash/txns', { day: addDays(todayStr(), -3), amount: 450, direction: 'out', merchant: 'Swiggy', description: 'dinner' });
    expect(t.status).toBe(201); expect(t.body.transaction.category).toBe('Food & dining');
    expect((await c.post('/api/cash/txns', { day: addDays(todayStr(), 3), amount: 5, direction: 'out' })).status).toBe(400);
    expect((await c.patch(`/api/cash/txns/${t.body.transaction.id}`, { category: 'Groceries' })).body.transaction.category).toBe('Groceries');
    const d1 = addDays(todayStr(), -40), d2 = addDays(todayStr(), -10);
    const imp = await c.post('/api/cash/import', { csv: `date,description,debit,credit\n${d1},Salary credit ACME,,100000\n${d1},Rent to landlord,25000,\n${d2},Netflix subscription,649,\nnotadate,x,1,` });
    expect(imp.status).toBe(200); expect(imp.body.imported).toBe(3); expect(imp.body.skipped).toBe(1);
    expect((await c.post('/api/cash/import', { csv: 'foo,bar\n1,2' })).status).toBe(400);
    const list = (await c.get('/api/cash/txns')).body.transactions; expect(list.length).toBe(4);
    expect(list.find(x => x.description?.includes('Salary')).category).toBe('Salary');
    expect((await c.put('/api/cash/budgets', { category: 'Groceries', monthlyLimit: 8000 })).status).toBe(200);
    const an = (await c.get('/api/cash/analysis')).body; expect(an.budgets[0].category).toBe('Groceries');
    expect((await c.get('/api/anomalies')).status).toBe(200);
    expect((await c.post('/api/cash/recategorise')).body.llm).toBe(false);
    const other = await newUser(app);
    expect((await other.c.patch(`/api/cash/txns/${t.body.transaction.id}`, { category: 'Other' })).status).toBe(404);
    expect((await other.c.get('/api/cash/txns')).body.transactions).toHaveLength(0);
    expect((await c.del(`/api/cash/txns/${t.body.transaction.id}`)).status).toBe(200);
  });
});
