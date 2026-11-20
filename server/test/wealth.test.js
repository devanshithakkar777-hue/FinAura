import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { fdValue, loanProjection, avalanchePlan, computeNetWorth, holdingView } from '../src/engines/wealth.js';
import { addDays, todayStr } from '../src/lib/dates.js';

describe('wealth engine', () => {
  it('compounds FDs quarterly and caps at maturity', () => {
    const h = { invested: 100000, rate: 8, start_date: '2024-01-01', maturity_date: '2025-01-01' };
    const v = fdValue(h, '2030-01-01');
    expect(v).toBeGreaterThan(108000); expect(v).toBeLessThan(108400);
    expect(fdValue(h, '2024-01-01')).toBeCloseTo(100000, 0);
  });
  it('projects a loan to zero and flags an EMI that cannot cover interest', () => {
    const p = loanProjection({ outstanding: 100000, rate: 12, emi: 10000 });
    expect(p.payoffPossible).toBe(true); expect(p.months).toBeGreaterThan(10); expect(p.months).toBeLessThan(13);
    expect(loanProjection({ outstanding: 100000, rate: 24, emi: 1000 }).payoffPossible).toBe(false);
  });
  it('extra payments save interest and the avalanche pays the priciest debt first', () => {
    const loans = [{ id: 'a', name: 'Car', outstanding: 200000, rate: 9, emi: 8000 }, { id: 'b', name: 'Card', outstanding: 50000, rate: 36, emi: 3000 }];
    const base = avalanchePlan(loans, 0), more = avalanchePlan(loans, 5000);
    expect(more.monthsToDebtFree).toBeLessThan(base.monthsToDebtFree);
    expect(more.totalInterest).toBeLessThan(base.totalInterest);
    expect(more.payoffOrder[0].id).toBe('b');
    expect(base.interestSaved).toBeGreaterThanOrEqual(0);
  });
  it('nets liabilities against assets', () => {
    const h = holdingView({ id: 1, kind: 'real_estate', name: 'Flat', invested: 5e6, current_value: 7e6, start_date: '2020-01-01' }, '2026-01-01');
    const nw = computeNetWorth({ market: { totals: { value: 1e6 }, allocation: [{ assetClass: 'equity', value: 1e6 }] }, holdings: [h], loans: [{ outstanding: 3e6, emi: 30000 }], profile: { annual_income: 2e6 } });
    expect(nw.totalAssets).toBe(8e6); expect(nw.netWorth).toBe(5e6);
    expect(nw.debtServiceRatio).toBeCloseTo(0.18, 2);
    expect(nw.liquidAssets).toBe(1e6);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('wealth API', () => {
  it('validates, isolates users, and feeds net worth', async () => {
    const { c } = await newUser(app);
    const bad = await c.post('/api/holdings', { kind: 'fd', name: 'FD', invested: 1000, startDate: '2024-01-01' });
    expect(bad.status).toBe(400);
    const start = addDays(todayStr(), -365);
    const fd = await c.post('/api/holdings', { kind: 'fd', name: 'HDFC FD', invested: 100000, rate: 7, startDate: start, maturityDate: addDays(todayStr(), 365) });
    expect(fd.status).toBe(201);
    expect(fd.body.holding.value).toBeGreaterThan(106500);
    expect((await c.post('/api/holdings', { kind: 'real_estate', name: 'Plot', invested: 2e6, currentValue: 3e6, startDate: start })).status).toBe(201);
    expect((await c.post('/api/holdings', { kind: 'pf', name: 'EPF', invested: 5e5, currentValue: 6e5, rate: 8.25, startDate: start })).status).toBe(201);
    const loan = await c.post('/api/liabilities', { kind: 'home', name: 'Home loan', outstanding: 1e6, rate: 8.5, emi: 20000 });
    expect(loan.status).toBe(201); expect(loan.body.loan.monthsLeft).toBeGreaterThan(60);
    const nw = (await c.get('/api/networth')).body;
    expect(nw.totalDebt).toBe(1e6);
    expect(nw.netWorth).toBeCloseTo(nw.totalAssets - 1e6, 2);
    expect(nw.byKind.fd).toBeGreaterThan(100000);
    expect((await c.get('/api/liabilities/plan?extra=5000')).body.plan.monthsToDebtFree).toBeGreaterThan(0);
    // patch + isolation
    const id = fd.body.holding.id;
    expect((await c.patch(`/api/holdings/${id}`, { name: 'Renamed FD' })).body.holding.name).toBe('Renamed FD');
    const other = await newUser(app);
    expect((await other.c.patch(`/api/holdings/${id}`, { name: 'x' })).status).toBe(404);
    expect((await other.c.del(`/api/holdings/${id}`)).status).toBe(404);
    expect((await other.c.get('/api/networth')).body.totalAssets).toBe(0);
    expect((await c.del(`/api/holdings/${id}`)).status).toBe(200);
  });
  it('stores and merges the financial profile', async () => {
    const { c } = await newUser(app);
    expect((await c.put('/api/profile', { age: 30, retirementAge: 60, annualIncome: 1.2e6, monthlyExpenses: 50000 })).status).toBe(200);
    const r = await c.put('/api/profile', { dependents: 2 });
    expect(r.body.profile).toMatchObject({ age: 30, retirementAge: 60, dependents: 2 });
    expect((await c.put('/api/profile', { retirementAge: 25 })).status).toBe(400);
    expect((await c.get('/api/profile')).body.profile.annualIncome).toBe(1200000);
  });
});
