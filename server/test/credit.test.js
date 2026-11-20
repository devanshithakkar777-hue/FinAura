import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { creditHealth, loanAffordability, emiOptions, balanceTransfer, strategyCompare, pvOfEmi, scoreBand } from '../src/engines/credit.js';
import { emiFor } from '../src/engines/lifemodel.js';

describe('credit engine', () => {
  it('bands scores and flags high utilisation, DTI and missed payments with tips', () => {
    expect([scoreBand(780), scoreBand(720), scoreBand(670), scoreBand(600)]).toEqual(['excellent', 'good', 'fair', 'poor']);
    const h = creditHealth({ profile: { totalLimit: 200000, utilised: 120000, enquiries6m: 5, missedPayments12m: 1, oldestAccountYears: 1 }, scores: [{ day: '2026-01-01', score: 690 }, { day: '2026-10-01', score: 720 }], monthlyEmi: 60000, annualIncome: 1200000 });
    expect(h.scoreBand).toBe('good'); expect(h.scoreTrend).toBe(30); expect(h.utilisation).toBe(0.6); expect(h.utilisationStatus).toBe('high');
    expect(h.debtToIncome).toBe(0.6); expect(h.dtiStatus).toBe('high'); expect(h.tips.length).toBeGreaterThanOrEqual(4);
    expect(h.tips[0].tip).toMatch(/60,000/);                                                  // 120k − 30% of 200k = 60k to pay down
    expect(creditHealth({ profile: null }).explain.confidenceLabel).toBe('low');
  });
  it('round-trips loan affordability with the EMI formula', () => {
    const emi = emiFor(5e6, 9, 20); expect(pvOfEmi(emi, 9, 20)).toBeCloseTo(5e6, -2);
    const a = loanAffordability({ annualIncome: 2400000, existingEmi: 20000, rate: 9, years: 20 });
    const takeHome = 2400000 / 12 * 0.88;
    expect(a.comfortable.maxEmi).toBe(Math.round(takeHome * 0.35 - 20000)); expect(a.stretch.maxLoan).toBeGreaterThan(a.comfortable.maxLoan);
    expect(loanAffordability({ annualIncome: 0, rate: 9, years: 20 }).ready).toBe(false);
    expect(loanAffordability({ annualIncome: 600000, existingEmi: 50000, rate: 9, years: 20 }).comfortable.maxEmi).toBe(0);
  });
  it('shows longer tenures cost more interest and picks a tenure that fits', () => {
    const o = emiOptions({ principal: 5e6, rate: 9, takeHome: 200000 });
    expect(o.options[0].emi).toBeGreaterThan(o.options.at(-1).emi); expect(o.options[0].totalInterest).toBeLessThan(o.options.at(-1).totalInterest);
    expect(o.suggestion.years).toBe(o.options.find(r => r.emi <= 70000).years);
  });
  it('values a balance transfer net of fees', () => {
    const t = balanceTransfer({ outstanding: 3e6, currentRate: 10, newRate: 8.5, remainingMonths: 180, feePct: 0.5 });
    expect(t.netSaving).toBeGreaterThan(0); expect(t.worthIt).toBe(true);
    expect(balanceTransfer({ outstanding: 3e6, currentRate: 9, newRate: 8.9, remainingMonths: 24, feePct: 1 }).worthIt).toBe(false);
  });
  it('compares avalanche and snowball; avalanche never costs more interest', () => {
    const loans = [{ id: 'a', name: 'Card', outstanding: 300000, rate: 36, emi: 12000 }, { id: 'b', name: 'Car', outstanding: 80000, rate: 9, emi: 4000 }, { id: 'c', name: 'Home', outstanding: 2e6, rate: 8.5, emi: 25000 }];
    const r = strategyCompare(loans, 10000);
    expect(r.avalanche.totalInterest).toBeLessThanOrEqual(r.snowball.totalInterest); expect(r.avalanche.payoffOrder[0].id).toBe('a'); expect(r.snowball.payoffOrder[0].id).toBe('b');
    expect(strategyCompare([], 0).ready).toBe(false);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('credit API', () => {
  it('stores profile and score history and serves the analyses', async () => {
    const { c } = await newUser(app);
    await c.put('/api/profile', { annualIncome: 2400000 });
    await c.post('/api/liabilities', { kind: 'personal', name: 'PL', outstanding: 300000, rate: 14, emi: 9000 });
    expect((await c.put('/api/credit/profile', { totalLimit: 300000, utilised: 90000, missedPayments12m: 0 })).status).toBe(200);
    expect((await c.put('/api/credit/profile', { utilised: 9e9 })).status).toBe(400);
    expect((await c.put('/api/credit/profile', { score: 700 })).status).toBe(400);
    expect((await c.post('/api/credit/scores', { score: 705, day: '2026-06-01' })).status).toBe(200);
    expect((await c.post('/api/credit/scores', { score: 730 })).status).toBe(200);
    expect((await c.post('/api/credit/scores', { score: 950 })).status).toBe(400);
    const h = (await c.get('/api/credit')).body; expect(h.health.scoreTrend).toBe(25); expect(h.health.utilisationStatus).toBe('good'); expect(h.monthlyEmi).toBe(9000);
    expect((await c.get('/api/credit/affordability?rate=9&years=20')).body.ready).toBe(true);
    expect((await c.get('/api/credit/emi-options?principal=2000000')).body.options).toHaveLength(6);
    expect((await c.get('/api/credit/emi-options')).status).toBe(400);
    expect((await c.get('/api/credit/transfer?outstanding=1000000&currentRate=10&newRate=8.5&remainingMonths=120')).body.netSaving).toBeGreaterThan(0);
    expect((await c.get('/api/credit/strategies?extra=2000')).body.ready).toBe(true);
  });
});
