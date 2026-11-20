import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { simulateLife, portfolioParams, emiFor } from '../src/engines/lifemodel.js';
import { compareScenarios, levers, catalogView } from '../src/engines/scenarios.js';
import { stressTest } from '../src/engines/stress.js';
import { addDays, todayStr } from '../src/lib/dates.js';

const st = { age: 30, retirementAge: 60, annualIncome: 1800000, monthlyExpenses: 50000, cash: 300000, portfolio: 1500000, property: 0, mu: 0.10, sigma: 0.15, debts: [{ outstanding: 2e6, rate: 8.5, emi: 30000 }], assumed: [] };
const O = { paths: 150, seed: 7 };

describe('life model', () => {
  it('is deterministic for a seed and monotone in income', () => {
    const a = simulateLife(st, [], O), b = simulateLife(st, [], O);
    expect(a.finalNetWorth).toEqual(b.finalNetWorth);
    const richer = simulateLife({ ...st, annualIncome: 3600000 }, [], O);
    expect(richer.finalNetWorth.p50).toBeGreaterThan(a.finalNetWorth.p50);
    expect(a.bands).toHaveLength(a.horizonYears + 1); expect(a.bands[5].p10).toBeLessThanOrEqual(a.bands[5].p90);
  });
  it('retiring much earlier lowers the chance money lasts; job loss raises cash-shortfall risk', () => {
    const base = simulateLife(st, [], O);
    expect(simulateLife(st, [{ type: 'retire_at', atMonth: 0, age: 42 }], O).probabilityFundsLast).toBeLessThan(base.probabilityFundsLast);
    const lean = { ...st, cash: 50000, portfolio: 100000 };
    const jl = simulateLife(lean, [{ type: 'job_loss', atMonth: 6, months: 24 }], O);
    expect(jl.probabilityCashShortfall).toBeGreaterThan(simulateLife(lean, [], O).probabilityCashShortfall);
  });
  it('accounts for a home purchase: new debt and property, less liquidity', () => {
    const home = simulateLife(st, [{ type: 'purchase_home', atMonth: 6, price: 8e6, downPct: 0.2, rate: 8.75, years: 20, rentSaved: 0 }], O);
    expect(home.bands[3].p50).not.toBe(simulateLife(st, [], O).bands[3].p50);
    expect(emiFor(6.4e6, 8.75, 20)).toBeGreaterThan(55000); expect(emiFor(6.4e6, 8.75, 20)).toBeLessThan(58000);
  });
  it('derives portfolio return and volatility from allocation', () => {
    const eq = portfolioParams([{ group: 'equity', value: 100 }]), mix = portfolioParams([{ group: 'equity', value: 50 }, { group: 'bond', value: 50 }]);
    expect(mix.sigma).toBeLessThan(eq.sigma); expect(mix.mu).toBeLessThan(eq.mu);
  });
});

describe('what-if and stress', () => {
  it('compares decisions on identical markets with explanations', () => {
    const r = compareScenarios(st, [{ kind: 'invest_monthly', params: { amount: 30000 } }, { kind: 'market_fall', params: { drop: 0.4 } }], O);
    expect(r.scenarios).toHaveLength(2);
    expect(r.scenarios[0].delta.finalNetWorthMedian).toBeGreaterThan(0);
    expect(r.scenarios[1].delta.finalNetWorthMedian).toBeLessThan(0);
    expect(r.scenarios[1].explain.risks.join(' ')).toMatch(/timing/i);
    expect(catalogView().map(c => c.kind)).toContain('buy_home');
  });
  it('ranks levers and flags assumed inputs as lower confidence', () => {
    expect(levers(st, { paths: 80, seed: 3 })).toHaveLength(4);
    const r = compareScenarios({ ...st, assumed: ['age', 'income', 'expenses'] }, [{ kind: 'job_loss' }], O);
    expect(r.scenarios[0].explain.confidenceLabel).toBe('low');
  });
  it('stress-tests the portfolio and the cash runway', () => {
    const nw = { totalAssets: 1e7, totalDebt: 2e6, monthlyEmi: 30000, allocation: [{ group: 'equity', value: 6e6 }, { group: 'crypto', value: 1e6 }, { group: 'cash', value: 1e6 }, { group: 'gold', value: 2e6 }] };
    const r = stressTest(nw, { annualIncome: 1.2e6, monthlyExpenses: 40000 });
    expect(r.worst.loss).toBeLessThan(0); expect(r.scenarios.length).toBeGreaterThan(4);
    const crash = r.scenarios.find(x => x.key === 'equity_crash');
    expect(crash.loss).toBe(Math.round(6e6 * -0.35 + 1e6 * -0.6 + 2e6 * 0.08));
    const rec = r.scenarios.find(x => x.key === 'recession'); expect(rec.monthlyGap).toBeGreaterThan(0); expect(rec.runwayMonths).toBeGreaterThan(0);
    expect(stressTest(nw, {}, undefined, { equity: -0.5 }).scenarios[0].loss).toBe(-3e6);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('intelligence API', () => {
  it('serves the twin, what-if and stress for a user with a profile, and snapshots daily', async () => {
    const { c } = await newUser(app);
    await c.put('/api/profile', { age: 30, retirementAge: 60, annualIncome: 1800000, monthlyExpenses: 50000, dependents: 0 });
    await c.post('/api/holdings', { kind: 'fd', name: 'FD', invested: 500000, rate: 7, startDate: addDays(todayStr(), -100) });
    await c.post('/api/holdings', { kind: 'real_estate', name: 'Flat', invested: 4e6, currentValue: 5e6, startDate: addDays(todayStr(), -900) });
    await c.post('/api/liabilities', { kind: 'home', name: 'Loan', outstanding: 2e6, rate: 8.5, emi: 30000 });
    const t = await c.get('/api/twin/life');
    expect(t.status).toBe(200);
    expect(t.body.projection.bands.length).toBeGreaterThan(30); expect(t.body.readiness.explain.risks.length).toBeGreaterThan(0);
    expect(t.body.readiness.probabilityFundsLast).toBeGreaterThanOrEqual(0); expect(t.body.levers).toHaveLength(4);
    await c.get('/api/twin/life');
    expect((await c.get('/api/twin/life/history')).body.snapshots).toHaveLength(1);
    const w = await c.post('/api/whatif', { picks: [{ kind: 'job_loss', params: { months: 12 } }] });
    expect(w.status).toBe(200); expect(w.body.scenarios[0].title).toMatch(/12 months/);
    expect((await c.post('/api/whatif', { picks: [{ kind: 'nope' }] })).status).toBe(400);
    expect((await c.post('/api/whatif', { picks: [] })).status).toBe(400);
    const s = (await c.get('/api/stress')).body; expect(s.scenarios[0].loss).toBeLessThanOrEqual(0);
    expect((await c.post('/api/stress/custom', { shocks: { equity: -0.4 } })).status).toBe(200);
    expect((await c.post('/api/stress/custom', { shocks: { equity: -5 } })).status).toBe(400);
  });
  it('requires auth', async () => {
    const { c } = await newUser(app); void c;
    const r = await app.inject({ method: 'GET', url: '/api/twin/life' });
    expect(r.statusCode).toBe(401);
  });
});
