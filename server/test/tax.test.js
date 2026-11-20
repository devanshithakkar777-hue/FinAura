import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser } from './helpers.js';
import { computeRegime, compareRegimes, hraExemption, savingOpportunities, realisedPieces, taxOnGains, capitalGainsReport, harvestingPlan, fyOf, documentChecklist } from '../src/engines/tax.js';

const asset = new Map([['EQ', { asset_class: 'equity' }], ['BTC', { asset_class: 'crypto' }], ['GLD', { asset_class: 'gold' }]]);
const tx = (id, symbol, side, quantity, price, executed_on) => ({ id, symbol, side, quantity, price, executed_on, created_at: id });

describe('income tax (FY 2026-27)', () => {
  it('matches hand-computed new-regime tax, the 12L rebate, marginal relief and the top slab', () => {
    expect(computeRegime('new', { grossIncome: 1275000 }).totalTax).toBe(0);          // 12.75L salaried → zero tax
    expect(computeRegime('new', { grossIncome: 1300000 }).totalTax).toBe(26000);      // marginal relief caps tax at the excess over 12L
    expect(computeRegime('new', { grossIncome: 1500000 }).totalTax).toBe(97500);
    expect(computeRegime('new', { grossIncome: 2500000 }).totalTax).toBe(319800);
  });
  it('old regime applies deductions, HRA and the 5L rebate', () => {
    const o = computeRegime('old', { grossIncome: 1500000, c80: 200000, d80Self: 25000, nps1b: 50000, homeLoanInterest: 200000 });
    expect(o.deductionDetail.section80C).toBe(150000); expect(o.taxableIncome).toBe(1500000 - 50000 - 150000 - 25000 - 50000 - 200000);
    expect(computeRegime('old', { grossIncome: 550000 }).totalTax).toBe(0);
    expect(hraExemption({ hraReceived: 240000, rentPaid: 300000, basic: 600000, metro: true })).toBe(240000);
    expect(hraExemption({ hraReceived: 240000, rentPaid: 100000, basic: 600000, metro: false })).toBe(40000);
  });
  it('recommends the cheaper regime with an explanation and flags missing income', () => {
    expect(compareRegimes({ grossIncome: 0 }).ready).toBe(false);
    const light = compareRegimes({ grossIncome: 1500000 }); expect(light.better).toBe('new');
    const heavy = compareRegimes({ grossIncome: 1500000, c80: 150000, d80Self: 25000, d80Parents: 50000, seniorParents: true, nps1b: 50000, homeLoanInterest: 200000, hraReceived: 300000, rentPaid: 360000, basic: 600000, metro: true });
    expect(heavy.better).toBe('old'); expect(heavy.saving).toBeGreaterThan(0); expect(heavy.explain.risks.length).toBeGreaterThan(0);
  });
  it('lists unused deduction headroom and the saving it could bring', () => {
    const s = savingOpportunities({ grossIncome: 2000000, c80: 50000 });
    expect(s.opportunities.find(o => o.section === '80C').headroom).toBe(100000);
    expect(s.opportunities.find(o => o.section === '80C').potentialSaving).toBe(Math.round(100000 * 0.30 * 1.04));
  });
});

describe('capital gains', () => {
  const trades = [
    tx(1, 'EQ', 'buy', 100, 100, '2025-01-10'), tx(2, 'EQ', 'sell', 100, 200, '2026-05-10'),     // long-term gain 10,000
    tx(3, 'EQ', 'buy', 100, 100, '2026-04-01'), tx(4, 'EQ', 'sell', 50, 300, '2026-08-01'),      // short-term gain 10,000
    tx(5, 'BTC', 'buy', 1, 1000000, '2026-04-02'), tx(6, 'BTC', 'sell', 1, 1200000, '2026-09-01'),
    tx(7, 'GLD', 'buy', 10, 6000, '2024-01-01'), tx(8, 'GLD', 'sell', 10, 7000, '2026-07-01'),   // long-term gold
  ];
  it('uses FIFO with dates and classifies terms by asset class', () => {
    const p = realisedPieces(trades, asset);
    expect(p.find(x => x.symbol === 'EQ' && x.term === 'long').gain).toBe(10000);
    expect(p.find(x => x.symbol === 'EQ' && x.term === 'short').gain).toBe(10000);
    expect(p.find(x => x.symbol === 'GLD').term).toBe('long');
    expect(fyOf('2026-03-31')).toBe('2025-26'); expect(fyOf('2026-04-01')).toBe('2026-27');
  });
  it('applies exemption, flat 30% on crypto, and offsets losses by the rules', () => {
    const r = capitalGainsReport({ txns: trades, assets: asset, fy: '2026-27', slabRate: 0.3 });
    // eqShort 10,000*20% + eqLong exempt + otherLong(gold 10,000)*12.5% + crypto 200,000*30%
    expect(r.taxBeforeCess).toBe(Math.round(2000 + 1250 + 60000)); expect(r.exemptionUsed).toBe(10000); expect(r.exemptionHeadroom).toBe(115000);
    const loss = taxOnGains([{ bucket: 'eq', term: 'short', gain: -5000, sellId: 'a' }, { bucket: 'eq', term: 'long', gain: 50000, sellId: 'b' }]);
    expect(loss.net.eqLong).toBe(45000); expect(loss.tax).toBe(0);                      // STCL offsets LTCG; still under the exemption
    const ltLoss = taxOnGains([{ bucket: 'eq', term: 'long', gain: -5000, sellId: 'a' }, { bucket: 'eq', term: 'short', gain: 8000, sellId: 'b' }]);
    expect(ltLoss.net.eqShort).toBe(8000); expect(ltLoss.lossCarryForward).toBe(5000);  // LTCL cannot offset STCG
    const vdaLoss = taxOnGains([{ bucket: 'vda', term: 'short', gain: -1000, sellId: 'a' }, { bucket: 'vda', term: 'short', gain: 5000, sellId: 'b' }]);
    expect(vdaLoss.vdaTaxableGain).toBe(5000);                                           // no VDA loss set-off
  });
  it('simulates tax-loss harvesting and tax-free gain booking', () => {
    const t = [tx(1, 'EQ', 'buy', 100, 100, '2026-04-10'), tx(2, 'EQ', 'sell', 100, 150, '2026-06-10'),   // realised STCG 5,000
      tx(3, 'EQ', 'buy', 100, 200, '2026-04-20'), tx(4, 'GLD', 'buy', 10, 5000, '2024-01-01')];
    const priceNow = new Map([['EQ', 150], ['GLD', 7000]]);
    const h = harvestingPlan({ txns: t, assets: asset, priceNow, today: '2026-11-20', fy: '2026-27', slabRate: 0.3 });
    expect(h.harvestableLosses).toBe(5000); expect(h.taxNow).toBeGreaterThan(h.taxAfterHarvest); expect(h.estimatedSaving).toBe(1040);
    expect(h.gainHarvest.unrealisedLongTermEquityGains).toBe(0);
  });
  it('builds a document checklist from the inputs', () => {
    const d = documentChecklist({ grossIncome: 1, rentPaid: 100, hasTrades: true }, { form16: true });
    expect(d.find(x => x.key === 'form16').done).toBe(true); expect(d.map(x => x.key)).toContain('rent'); expect(d.map(x => x.key)).not.toContain('nps');
  });
});

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('tax API', () => {
  it('stores inputs, compares regimes, reports gains and tracks documents', async () => {
    const { c } = await newUser(app);
    expect((await c.get('/api/tax/regimes')).body.comparison.ready).toBe(false);
    await c.put('/api/profile', { annualIncome: 1800000 });
    expect((await c.put('/api/tax/inputs', { c80: 150000, nps1b: 50000, rentPaid: 300000, hraReceived: 200000, basic: 700000, metro: true })).status).toBe(200);
    expect((await c.put('/api/tax/inputs', { bogus: 1 })).status).toBe(400);
    expect((await c.put('/api/tax/inputs', { c80: -5 })).status).toBe(400);
    const r = (await c.get('/api/tax/regimes')).body; expect(r.comparison.ready).toBe(true); expect(['old', 'new']).toContain(r.comparison.better);
    const demo = await c.post('/api/demo'); void demo;
    expect((await c.get('/api/tax/capital-gains')).status).toBe(200);
    expect((await c.get('/api/tax/capital-gains?fy=2025-26')).body.fy).toBe('2025-26');
    expect((await c.get('/api/tax/capital-gains?fy=bad')).status).toBe(400);
    expect((await c.get('/api/tax/harvest')).status).toBe(200);
    expect((await c.put('/api/tax/documents', { key: 'form16', done: true })).status).toBe(200);
    expect((await c.get('/api/tax/documents')).body.documents.find(d => d.key === 'form16').done).toBe(true);
    expect((await c.put('/api/tax/documents', { key: 'nope', done: true })).status).toBe(400);
    const ov = (await c.get('/api/tax/overview')).body; expect(ov.estimatedTotalTax).toBeGreaterThanOrEqual(0);
  });
});
