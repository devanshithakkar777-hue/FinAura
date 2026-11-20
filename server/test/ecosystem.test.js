import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { wellnessScore, splitRatio, settleExpenses, estateReadiness, transferModel, privateSummary, esgView, dividendSummary, detectFraudRisk, proposeTasks, biasProfile, EXERCISES, LESSONS, regexExtract } from '../src/engines/ecosystem.js';

describe('ecosystem engines', () => {
  it('wellness score re-weights over available components and names the weakest', () => {
    const w = wellnessScore({ profile: { annualIncome: 1200000, monthlyExpenses: 60000 }, nw: { monthlyEmi: 10000, totalAssets: 1 }, emergency: { ready: true, coverageMonths: 4, targetMonths: 6 }, insurance: { gaps: [{ kind: 'life', gap: 1 }, { kind: 'health', gap: 0 }] }, diversification: 80, retirement: null });
    expect(w.ready).toBe(true); expect(w.missing).toEqual(['retirement']); expect(w.weakest).toBe('insurance'); expect(w.components.find(c => c.key === 'emergency').score).toBe(67);
    expect(w.components.find(c => c.key === 'savings').score).toBe(100 * Math.min(1, 0.4 / 0.2)); expect(w.explain.risks.join(' ')).toMatch(/retirement/);
    expect(wellnessScore({ profile: {}, nw: {}, emergency: null, insurance: null, diversification: null, retirement: null }).ready).toBe(false);
  });
  it('splits shared expenses by income and settles with the fewest transfers', () => {
    expect(splitRatio([{ userId: 'a', income: 300 }, { userId: 'b', income: 100 }]).map(r => r.ratio)).toEqual([0.75, 0.25]);
    const s = settleExpenses([{ paidBy: 'a', amount: 400 }], [{ userId: 'a', income: 300 }, { userId: 'b', income: 100 }]);
    expect(s.transfers).toEqual([{ from: 'b', to: 'a', amount: 100 }]); expect(s.balances.reduce((t, b) => t + b.balance, 0)).toBeLessThanOrEqual(1);
  });
  it('estate readiness flags missing basics and models transfers', () => {
    const none = estateReadiness({ plan: {}, beneficiaries: [], netWorth: 1e7, dependents: 1, today: '2026-11-21' });
    expect(none.score).toBe(0); expect(none.items.find(i => i.key === 'guardian').ok).toBe(false);
    const good = estateReadiness({ plan: { willExists: true, willUpdatedOn: '2025-01-01', guardianNamed: true, powerOfAttorney: true, nomineesUpdatedOn: '2026-01-01' }, beneficiaries: [{ sharePct: 60 }, { sharePct: 40 }], netWorth: 1e7, dependents: 1, today: '2026-11-21' });
    expect(good.score).toBe(100);
    const stale = estateReadiness({ plan: { willExists: true, willUpdatedOn: '2015-01-01' }, beneficiaries: [{ sharePct: 50 }], netWorth: 0, today: '2026-11-21' });
    expect(stale.items.find(i => i.key === 'will_fresh').ok).toBe(false); expect(stale.items.find(i => i.key === 'beneficiaries').advice).toMatch(/50%/);
    expect(transferModel({ estateValue: 1000, beneficiaries: [{ name: 'A', relation: 'spouse', sharePct: 70 }, { name: 'B', relation: 'child', sharePct: 30 }] }).distribution.map(d => d.amount)).toEqual([700, 300]);
  });
  it('values private and foreign assets, property yield and illiquidity', () => {
    const sum = privateSummary([
      { kind: 'property', name: 'Flat', currency: 'INR', fxRate: 1, invested: 5e6, currentValue: 8e6, startDate: '2020-11-21', lockinUntil: null, monthlyIncome: 20000, annualCosts: 40000, loanOutstanding: 2e6 },
      { kind: 'foreign', name: 'US ETF', currency: 'USD', fxRate: 85, invested: 1000, currentValue: 1200, startDate: '2024-01-01', lockinUntil: null, monthlyIncome: 0, annualCosts: 0, loanOutstanding: 0 },
    ], '2026-11-21');
    const flat = sum.views[0]; expect(flat.property.grossYield).toBe(0.03); expect(flat.property.netYield).toBe(0.025); expect(flat.property.equity).toBe(6e6); expect(flat.cagr).toBeGreaterThan(0.05);
    expect(sum.views[1].valueBase).toBe(102000); expect(sum.views[1].illiquid).toBe(false); expect(sum.illiquidShare).toBeGreaterThan(0.9); expect(sum.warnings.join(' ')).toMatch(/60%/);
    expect(sum.byCurrency.map(c => c.key).sort()).toEqual(['INR', 'USD']);
  });
  it('computes weighted ESG with coverage and exclusions, and dividend income', () => {
    const v = esgView({ positions: [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.3 }, { symbol: 'C', weight: 0.2 }], ratings: [{ symbol: 'A', e: 80, s: 80, g: 80, excluded: false }, { symbol: 'B', e: 40, s: 40, g: 40, excluded: true }] });
    expect(v.score).toBe(65); expect(v.coverage).toBe(0.8); expect(v.excludedHeld[0].symbol).toBe('B'); expect(v.laggards[0].symbol).toBe('B');
    const d = dividendSummary({ records: [{ symbol: 'X', amount: 1000, received_on: '2026-03-10' }, { symbol: 'X', amount: 500, received_on: '2025-01-10' }], manualAnnualIncome: 12000, marketValue: 100000, today: '2026-11-21' });
    expect(d.ttm).toBe(1000); expect(d.forwardEstimate).toBe(13000); expect(d.monthlyAverage).toBe(1083); expect(d.byMonth[2].amount).toBe(1000);
  });
  it('flags scam wording, large new payees and repeated payments, but not ordinary spending', () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ day: `2026-10-${10 + i}`, amount: 500, direction: 'out', merchant: `Shop${i}`, description: 'groceries' }));
    expect(detectFraudRisk(base).flags).toHaveLength(0);
    const f = detectFraudRisk([...base, { day: '2026-11-01', amount: 90000, direction: 'out', merchant: 'Unknown Co', description: 'transfer' }, { day: '2026-11-02', amount: 100, direction: 'out', merchant: 'Prize Desk', description: 'claim your lottery prize' }, ...Array(3).fill({ day: '2026-11-03', amount: 49, direction: 'out', merchant: 'QuickPay', description: 'x' })]).flags.map(x => x.type);
    expect(f).toEqual(expect.arrayContaining(['large_new_payee', 'scam_wording', 'repeated_same_day']));
  });
  it('proposes tasks from real gaps, each needing approval', () => {
    const p = proposeTasks({ wellness: { ready: true, score: 50 }, emergency: { ready: true, gap: 100000, coverageMonths: 2, targetMonths: 6 }, insurance: { gaps: [{ kind: 'life', gap: 5e6 }] }, loans: [{ name: 'Card', highInterest: true }], estate: { score: 20, items: [{ ok: false, label: 'will' }] }, concentration: { symbol: 'ABC', weight: 0.5 } });
    expect(p.map(x => x.key)).toEqual(expect.arrayContaining(['emergency_gap', 'high_interest_debt', 'insurance_life', 'estate_basics', 'concentration']));
    expect(p.every(x => x.detail.requiresYourApproval && x.detail.explain.risks.length)).toBe(true);
  });
  it('bias profile, lessons and extraction fallbacks are well formed', () => {
    expect(new Set(EXERCISES.map(e => e.id)).size).toBe(EXERCISES.length); expect(EXERCISES.every(e => e.answer < e.options.length)).toBe(true); expect(LESSONS.every(l => l.quiz.answer < l.quiz.options.length)).toBe(true);
    const b = biasProfile([{ bias: 'herd', correct: false }, { bias: 'herd', correct: true }, { bias: 'fomo', correct: true }], [{ severity: 'concern', label: 'Panic selling', detail: 'x' }, { severity: 'good', label: 'Consistent', detail: 'y' }]);
    expect(b.rows.find(r => r.bias === 'herd').accuracy).toBe(50); expect(b.weak).toEqual(['Herd behaviour']); expect(b.fromTrades).toHaveLength(1);
    expect(regexExtract('Premium Rs. 12,500 due 2026-12-01').amounts).toEqual([12500]);
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('ecosystem API', () => {
  it('household: invite, consent, privacy levels, expenses and leaving', async () => {
    const a = await newUser(app, { name: 'Asha' }), b = await newUser(app, { name: 'Ben' }), c = await newUser(app);
    await a.c.post('/api/demo'); await b.c.post('/api/demo');
    await a.c.put('/api/profile', { age: 32, retirementAge: 60, annualIncome: 3000000, monthlyExpenses: 80000 });
    await b.c.put('/api/profile', { age: 33, retirementAge: 60, annualIncome: 1000000, monthlyExpenses: 40000 });
    expect((await a.c.post('/api/household', { name: 'Home', shareLevel: 'full' })).status).toBe(201);
    expect((await a.c.post('/api/household', { name: 'Again' })).status).toBe(409);
    expect((await b.c.post('/api/household/invite', { email: 'x@example.com' })).status).toBe(403);
    expect((await a.c.post('/api/household/invite', { email: b.email })).status).toBe(201);
    expect((await a.c.post('/api/household/invite', { email: b.email })).status).toBe(409);
    expect((await a.c.get('/api/household/dashboard')).body.members).toHaveLength(1);   // not visible until accepted
    const inv = (await b.c.get('/api/household')).body.invitations; expect(inv).toHaveLength(1);
    expect((await c.c.post('/api/household/accept', { householdId: inv[0].id })).status).toBe(404);   // not their invitation
    expect((await b.c.post('/api/household/accept', { householdId: inv[0].id, shareLevel: 'summary' })).status).toBe(200);
    const dash = (await a.c.get('/api/household/dashboard')).body, ben = dash.members.find(m => m.name === 'Ben'), asha = dash.members.find(m => m.you);
    expect(ben.totalAssets).toBeUndefined(); expect(typeof ben.netWorth).toBe('number'); expect(asha.totalAssets).toBeDefined();   // Ben shares summary only
    expect(dash.combinedNetWorth).toBe(dash.members.reduce((s, m) => s + m.netWorth, 0));
    expect((await b.c.get('/api/household/dashboard')).body.members.find(m => m.name === 'Asha').totalAssets).toBeDefined();   // Asha shares full
    await a.c.post('/api/household/expenses', { amount: 4000, label: 'Rent share', day: '2026-11-01' });
    const ex = (await b.c.get('/api/household/expenses')).body; expect(ex.settlement.transfers).toHaveLength(1);
    expect(ex.settlement.transfers[0]).toMatchObject({ fromName: 'Ben', toName: 'Asha', amount: 1000 });   // Ben earns 25% so owes 25% of 4000
    expect((await b.c.del('/api/household/leave')).body.dissolved).toBe(false);
    expect((await a.c.get('/api/household/dashboard')).body.members).toHaveLength(1);
    expect((await a.c.del('/api/household/leave')).body.dissolved).toBe(true);
    expect((await a.c.get('/api/household')).body.household).toBeNull();
  });
  it('estate, private assets, dividends, ESG and wellness work end to end', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    await c.put('/api/profile', { age: 35, retirementAge: 60, annualIncome: 2400000, monthlyExpenses: 70000, dependents: 2 });
    expect((await c.post('/api/estate/beneficiaries', { name: 'Spouse', relation: 'spouse', sharePct: 60 })).status).toBe(201);
    expect((await c.post('/api/estate/beneficiaries', { name: 'Child', relation: 'child', sharePct: 50, minor: true })).status).toBe(400);   // over 100%
    const child = await c.post('/api/estate/beneficiaries', { name: 'Child', relation: 'child', sharePct: 40, minor: true });
    await c.put('/api/estate/plan', { willExists: true, willUpdatedOn: '2026-01-01', guardianNamed: false, powerOfAttorney: false, nomineesUpdatedOn: '2026-02-01' });
    const e = (await c.get('/api/estate')).body; expect(e.readiness.items.find(i => i.key === 'guardian').ok).toBe(false); expect(e.transfer.distribution).toHaveLength(2);
    expect((await c.del(`/api/estate/beneficiaries/${child.body.id}`)).status).toBe(200);
    expect((await c.post('/api/private', { kind: 'property', name: 'Flat', invested: 5e6, currentValue: 8e6, startDate: '2021-01-01', monthlyIncome: 25000, annualCosts: 30000, loanOutstanding: 2e6 })).status).toBe(201);
    const fx = await c.post('/api/private', { kind: 'foreign', name: 'US stocks', currency: 'usd', fxRate: 85, invested: 1000, currentValue: 1500, startDate: '2024-01-01' });
    expect((await c.patch(`/api/private/${fx.body.id}`, { fxRate: 90 })).status).toBe(200);
    const p = (await c.get('/api/private')).body; expect(p.views).toHaveLength(2); expect(p.views.find(v => v.name === 'US stocks').valueBase).toBe(135000);
    expect((await c.post('/api/private', { kind: 'property', name: 'bad', invested: -1, currentValue: 1, startDate: '2021-01-01' })).status).toBe(400);
    const div = await c.post('/api/dividends', { symbol: 'infy', amount: 2500, receivedOn: '2026-06-15' }); expect(div.status).toBe(201);
    expect((await c.get('/api/dividends')).body.summary.ttm).toBe(2500);
    expect((await c.put('/api/esg/INFY', { e: 70, s: 60, g: 80, excluded: false })).status).toBe(200);
    expect((await c.get('/api/esg')).body.ratings).toHaveLength(1);
    const w = (await c.get('/api/wellness')).body; expect(w.wellness.ready).toBe(true); expect(w.wellness.score).toBeGreaterThanOrEqual(0); expect(w.learnNext.length).toBeGreaterThan(0);
    const bm = (await c.get('/api/benchmarks')).body; expect(bm.rows.length).toBeGreaterThan(0); expect(bm.cohort.available).toBe(false);
  });
  it('learn, bias lab, life events, co-pilot, fraud and documents', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    await c.put('/api/profile', { age: 30, retirementAge: 58, annualIncome: 1500000, monthlyExpenses: 90000 });
    const lesson = (await c.get('/api/learn/emergency')).body; expect(lesson.quiz.answer).toBeUndefined();
    expect((await c.post('/api/learn/emergency/answer', { choice: 1 })).body).toMatchObject({ correct: true, xp: 25 });
    expect((await c.post('/api/learn/emergency/answer', { choice: 1 })).body.xp).toBe(0);   // XP only once
    expect((await c.get('/api/learn')).body.lessons.find(l => l.id === 'emergency').done).toBe(true);
    expect((await c.get('/api/psych/lab')).body.exercises[0].answer).toBeUndefined();
    expect((await c.post('/api/psych/lab/answer', { exerciseId: 'herd_x', choice: 0 })).status).toBe(404);
    const ans = await c.post('/api/psych/lab/answer', { exerciseId: 'hd1', choice: 0 }); expect(ans.body.correct).toBe(false); expect(ans.body.why).toMatch(/Crowds/);
    expect((await c.get('/api/psych/profile')).body.rows.find(r => r.bias === 'herd').accuracy).toBe(0);
    const ev = await c.post('/api/life-events', { kind: 'home', plannedOn: '2027-06-01' }); expect(ev.status).toBe(201);
    const plan = (await c.get(`/api/life-events/${ev.body.id}/plan`)).body; expect(plan.checklist.length).toBeGreaterThan(2); expect(plan.suggestedWhatIfs[0].id).toBe('buy_home'); expect(plan.monthsAway).toBeGreaterThan(0);
    expect((await c.post('/api/life-events', { kind: 'nonsense' })).status).toBe(400);
    expect((await c.post('/api/copilot/refresh')).body.proposed).toBeGreaterThan(0);
    const tasks = (await c.get('/api/copilot')).body.tasks; expect(tasks.every(t => t.status === 'proposed' && t.detail.requiresYourApproval)).toBe(true);
    expect((await c.post(`/api/copilot/${tasks[0].id}/decision`, { decision: 'dismiss' })).body.status).toBe('dismissed');
    await c.post('/api/copilot/refresh');
    expect((await c.get('/api/copilot')).body.tasks.find(t => t.id === tasks[0].id).status).toBe('dismissed');   // not resurrected
    expect((await c.post(`/api/copilot/${tasks[0].id}/decision`, { decision: 'bogus' })).status).toBe(400);
    await c.post('/api/cash/txns', { day: '2026-11-02', amount: 100, direction: 'out', merchant: 'Prize Desk', description: 'claim lottery prize' });
    expect((await c.get('/api/fraud')).body.flags.some(f => f.type === 'scam_wording')).toBe(true);
    const doc = (await c.post('/api/documents/analyze', { kind: 'insurance', text: 'Policy premium Rs. 18,000 per year, sum assured Rs. 10,00,000 from 2026-01-01' })).body;
    expect(doc.llm).toBe(false); expect(doc.fallback.amounts).toEqual([18000, 1000000]); 
    expect((await c.get('/api/claims/checklist/health')).body.checklist.length).toBeGreaterThan(3); expect((await c.get('/api/claims/checklist/xyz')).status).toBe(404);
  });
});
