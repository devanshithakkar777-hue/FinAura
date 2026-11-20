import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { retirementPlan, emergencyFund, rebalance, signalFor, insuranceAnalysis, requiredSip, futureValue, comparePolicies } from '../src/engines/planning.js';
import { addDays, todayStr } from '../src/lib/dates.js';

describe('planning engine', () => {
  it('required SIP actually reaches the target', () => {
    const sip = requiredSip(100000, 5e6, 15, 0.1);
    expect(futureValue(100000, sip, 15, 0.1)).toBeGreaterThan(4.99e6);
    expect(futureValue(100000, sip, 15, 0.1)).toBeLessThan(5.01e6);
    expect(requiredSip(5e6, 1e6, 10, 0.1)).toBe(0);
  });
  it('flags missing inputs and assesses retirement readiness with an explanation', () => {
    expect(retirementPlan({ profile: { age: 30 }, investable: 0 }).ready).toBe(false);
    const p = retirementPlan({ profile: { age: 30, retirementAge: 60, monthlyExpenses: 50000 }, investable: 500000, monthlySaving: 10000, allocation: [{ group: 'equity', value: 1 }] });
    expect(p.ready).toBe(true); expect(p.corpusNeeded).toBeGreaterThan(p.projectedCorpus * 0.5);
    expect(['on_track', 'close', 'behind']).toContain(p.status);
    expect(p.explain.risks.length).toBeGreaterThan(0); expect(p.explain.confidenceLabel).toBe('low');
    const more = retirementPlan({ profile: { age: 30, retirementAge: 60, monthlyExpenses: 50000 }, investable: 500000, monthlySaving: p.requiredMonthlySip + 1, allocation: [{ group: 'equity', value: 1 }] });
    expect(more.status).toBe('on_track');
  });
  it('sizes the emergency fund and extends it for dependents', () => {
    const a = emergencyFund({ profile: { monthlyExpenses: 50000, dependents: 0 }, liquid: 100000, monthlyEmi: 10000 });
    const b = emergencyFund({ profile: { monthlyExpenses: 50000, dependents: 2 }, liquid: 100000, monthlyEmi: 10000 });
    expect(a.target).toBe(360000); expect(b.target).toBe(540000); expect(a.status).toBe('low');
  });
  it('directs new money to underweight groups before suggesting sales', () => {
    const r = rebalance({ allocation: [{ group: 'equity', value: 900000 }, { group: 'bond', value: 100000 }], riskProfile: 'Moderate', newMoney: 200000 });
    expect(r.needsRebalance).toBe(true);
    expect(r.buyPlan.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(200000, 0);
    expect(r.buyPlan.find(b => b.group === 'equity')).toBeUndefined();
  });
  it('gives trim on overbought + concentrated, hold otherwise, and low confidence without market data', () => {
    const series = Array.from({ length: 60 }, (_, i) => ({ day: `d${i}`, close: 100 + i * 2 }));
    const trim = signalFor({ symbol: 'X', name: 'X', weight: 0.6, unrealisedPct: 0.8 }, series, 80, 'Moderate');
    expect(trim.action).toBe('trim'); expect(trim.explain.risks.join(' ')).toMatch(/tax/i);
    const hold = signalFor({ symbol: 'Y', name: 'Y', weight: 0.1, unrealisedPct: 0.1 }, series.slice(0, 5), 50, 'Moderate');
    expect(hold.action).toBe('hold'); expect(hold.explain.confidenceLabel).toBe('low');
  });
  it('finds insurance gaps from income, debt and dependents', () => {
    const a = insuranceAnalysis({ profile: { age: 30, annualIncome: 1200000, dependents: 2 }, policies: [], debt: 2e6, liquidAssets: 0 });
    expect(a.gaps.map(g => g.kind).sort()).toEqual(['health', 'term']);
    expect(a.needs.life).toBe(1200000 * 15 + 2e6);
    const ok = insuranceAnalysis({ profile: { age: 30, annualIncome: 1200000, dependents: 0 }, policies: [{ kind: 'term', sumAssured: 3e7, annualPremium: 15000 }, { kind: 'health', sumAssured: 2e6, annualPremium: 12000 }], debt: 0, liquidAssets: 0 });
    expect(ok.gaps).toEqual([]);
    expect(comparePolicies([{ id: 1, name: 'a', insurer: 'x', kind: 'term', sumAssured: 1e7, annualPremium: 10000, startDate: '2024-01-01' }, { id: 2, name: 'b', insurer: 'y', kind: 'term', sumAssured: 1e7, annualPremium: 8000, startDate: '2024-01-01' }])[0].id).toBe(2);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('planning API', () => {
  it('runs plans end to end from a profile and holdings', async () => {
    const { c } = await newUser(app);
    expect((await c.get('/api/plan/retirement')).body.plan.ready).toBe(false);
    await c.put('/api/profile', { age: 32, retirementAge: 58, annualIncome: 1800000, monthlyExpenses: 60000, dependents: 1 });
    await c.post('/api/holdings', { kind: 'fd', name: 'FD', invested: 400000, rate: 7, startDate: addDays(todayStr(), -200) });
    await c.post('/api/liabilities', { kind: 'home', name: 'Loan', outstanding: 3e6, rate: 8.5, emi: 35000 });
    const r = (await c.get('/api/plan/retirement?monthlySaving=20000')).body.plan;
    expect(r.ready).toBe(true); expect(r.years).toBe(26);
    const e = (await c.get('/api/plan/emergency')).body.plan;
    expect(e.targetMonths).toBe(9); expect(e.liquid).toBeGreaterThan(400000);
    const pr = (await c.get('/api/plan/projection?years=10&monthly=10000')).body;
    expect(pr.points).toHaveLength(11); expect(pr.points[10].real).toBeLessThan(pr.points[10].nominal);
    expect((await c.get('/api/plan/rebalance?newMoney=50000')).body.plan.ready).toBe(true);
    expect((await c.get('/api/signals')).body.signals).toEqual([]);
    const bad = await c.get('/api/plan/projection?years=500');
    expect(bad.status).toBe(400);
  });
  it('manages insurance policies and reports gaps, isolated per user', async () => {
    const { c } = await newUser(app);
    await c.put('/api/profile', { age: 30, annualIncome: 1200000, dependents: 2 });
    const p = await c.post('/api/insurance', { kind: 'term', insurer: 'LIC', name: 'Tech Term', sumAssured: 5e6, annualPremium: 9000, startDate: '2024-04-01', termYears: 30 });
    expect(p.status).toBe(201);
    const r = (await c.get('/api/insurance')).body;
    expect(r.analysis.gaps.map(g => g.kind)).toContain('term'); expect(r.analysis.gaps.map(g => g.kind)).toContain('health');
    expect(r.comparison[0].premiumPerLakh).toBe(180);
    const other = await newUser(app);
    expect((await other.c.del(`/api/insurance/${p.body.policy.id}`)).status).toBe(404);
    expect((await c.post('/api/insurance', { kind: 'term', insurer: 'x', name: 'y', sumAssured: -5, annualPremium: 1, startDate: '2024-01-01' })).status).toBe(400);
    expect((await c.del(`/api/insurance/${p.body.policy.id}`)).status).toBe(200);
  });
});
