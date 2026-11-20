import { describe, it, expect } from 'vitest';
import { buildLedger, OversellError, computePositions } from '../src/engines/portfolio.js';
import { analyzeBehavior, tagTransactions, detectSip } from '../src/engines/behavior.js';
import { runPremortem } from '../src/engines/premortem.js';
import { runCouncil, parseQuestion } from '../src/engines/council.js';
import { runTwin, habitsFromBehavior, mulberry32 } from '../src/engines/twin.js';
import { computeHealth } from '../src/engines/health.js';
import { levelFromXP } from '../src/engines/gamify.js';
import { demoTransactions, genSeries, DEMO_ASSETS } from '../src/services/demo.js';
import { parseCsv } from '../src/lib/csv.js';
import { rsi, priceOn } from '../src/lib/series.js';
import { addDays } from '../src/lib/dates.js';

const TODAY = '2026-11-20';
const t = (symbol, side, quantity, price, executed_on, i = 0) => ({ id: `${symbol}${executed_on}${side}${i}`, symbol, side, quantity, price, executed_on, created_at: i });

describe('ledger', () => {
  it('computes FIFO realised P&L', () => {
    const l = buildLedger([t('A', 'buy', 10, 100, '2026-01-01'), t('A', 'buy', 10, 200, '2026-02-01', 1), t('A', 'sell', 15, 300, '2026-03-01', 2)]);
    expect(l.realised).toBeCloseTo(10 * 200 + 5 * 100); // 10@+200, 5@+100
    expect(l.lots.get('A')[0].qty).toBeCloseTo(5);
  });
  it('rejects overselling', () => {
    expect(() => buildLedger([t('A', 'buy', 1, 10, '2026-01-01'), t('A', 'sell', 2, 10, '2026-01-02', 1)])).toThrow(OversellError);
  });
  it('rejects a sell dated before the buy', () => {
    expect(() => buildLedger([t('A', 'sell', 1, 10, '2026-01-01'), t('A', 'buy', 1, 10, '2026-01-02', 1)])).toThrow(OversellError);
  });
  it('computes positions and weights', () => {
    const assets = new Map([['A', { name: 'A', asset_class: 'equity', volatility: 'Moderate' }], ['B', { name: 'B', asset_class: 'crypto', volatility: 'High' }]]);
    const r = computePositions([t('A', 'buy', 10, 100, '2026-01-01'), t('B', 'buy', 1, 1000, '2026-01-01', 1)], assets, new Map([['A', 150], ['B', 500]]), TODAY);
    expect(r.totals.value).toBe(2000);
    expect(r.positions.find(p => p.symbol === 'A').weight).toBeCloseTo(0.75);
    expect(r.totals.unrealised).toBe(0);
  });
});

describe('series helpers', () => {
  it('carries prices forward and computes RSI bounds', () => {
    const s = [{ day: '2026-01-01', close: 10 }, { day: '2026-01-05', close: 12 }];
    expect(priceOn(s, '2026-01-03')).toBe(10);
    expect(priceOn(s, '2025-12-01')).toBe(10);
    const up = Array.from({ length: 30 }, (_, i) => ({ day: addDays('2026-01-01', i), close: 100 + i }));
    expect(rsi(up)).toBe(100);
    expect(rsi(up.slice(0, 5))).toBeNull();
  });
  it('parses quoted CSV', () => {
    const rows = parseCsv('Date,Symbol,Note\r\n2026-01-01,"A,B","say ""hi"""\n');
    expect(rows[0]).toEqual({ date: '2026-01-01', symbol: 'A,B', note: 'say "hi"' });
  });
});

function demoCtx() {
  const assets = new Map(DEMO_ASSETS.map(a => [a.symbol, a]));
  const seriesBySymbol = new Map(DEMO_ASSETS.map(a => [a.symbol, genSeries(a, TODAY)]));
  const raw = demoTransactions(TODAY);
  const txns = raw.map((x, i) => ({ id: `d${i}`, symbol: x.symbol, side: x.side, quantity: x.quantity, price: x.price, executed_on: x.day, created_at: i }));
  const priceNow = new Map([...seriesBySymbol].map(([s, ser]) => [s, ser[ser.length - 1].close]));
  const port = computePositions(txns, assets, priceNow, TODAY);
  const health = computeHealth(port.positions, 'Moderate');
  const cryptoWeight = port.allocation.find(a => a.assetClass === 'crypto')?.weight ?? 0;
  return { assets, seriesBySymbol, txns, priceNow, ...port, health, cryptoWeight };
}

describe('demo data + behaviour engine', () => {
  const ctx = demoCtx();
  const behavior = analyzeBehavior({ txns: ctx.txns, seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets, positionsInfo: { positions: ctx.positions, cryptoWeight: ctx.cryptoWeight, health: ctx.health }, riskProfile: 'Moderate', today: TODAY });

  it('is deterministic and never oversells', () => {
    expect(() => buildLedger(ctx.txns)).not.toThrow();
    expect(genSeries(DEMO_ASSETS[0], TODAY)).toEqual(genSeries(DEMO_ASSETS[0], TODAY));
    // extending the series never changes earlier days
    const shorter = genSeries(DEMO_ASSETS[1], '2026-06-01');
    const longer = genSeries(DEMO_ASSETS[1], TODAY);
    expect(longer.slice(0, shorter.length)).toEqual(shorter);
  });

  it('detects the planted panic sells and FOMO buys', () => {
    expect(behavior.status).toBe('ok');
    expect(behavior.evidence.panicSells).toBeGreaterThanOrEqual(1);
    expect(behavior.evidence.fomoBuys).toBeGreaterThanOrEqual(1);
    expect(behavior.evidence.sipSymbols).toEqual(expect.arrayContaining(['DEMO_INDEX', 'DEMO_FUND']));
  });

  it('behavioural alpha equals actual wealth minus stay-the-course wealth (accounting identity)', () => {
    const tagged = tagTransactions(ctx.txns, ctx.seriesBySymbol, ctx.assets, TODAY);
    // actual = held value + sell proceeds ; stay-the-course = value of all bought units today
    const nowP = s => ctx.priceNow.get(s);
    const held = ctx.positions.reduce((s, p) => s + p.value, 0);
    const proceeds = ctx.txns.filter(x => x.side === 'sell').reduce((s, x) => s + x.quantity * x.price, 0);
    const stay = ctx.txns.filter(x => x.side === 'buy').reduce((s, x) => s + x.quantity * nowP(x.symbol), 0);
    const alpha = held + proceeds - stay;
    const fromTags = tagged.reduce((s, x) => s + x.contribution, 0);
    expect(fromTags).toBeCloseTo(alpha, 3);
    expect(Math.abs(behavior.alpha.amount - Math.round(alpha))).toBeLessThanOrEqual(1);
  });

  it('scores traits within 0..100', () => {
    for (const v of [behavior.score, ...Object.values(behavior.traits)]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });

  it('returns insufficient_data for tiny histories', () => {
    const r = analyzeBehavior({ txns: ctx.txns.slice(0, 2), seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets, today: TODAY });
    expect(r.status).toBe('insufficient_data');
  });

  it('detects SIP regularity only when buys are ~monthly', () => {
    expect(detectSip([t('A', 'buy', 1, 1, '2026-01-05'), t('A', 'buy', 1, 1, '2026-02-05'), t('A', 'buy', 1, 1, '2026-03-05')])).toEqual(['A']);
    expect(detectSip([t('A', 'buy', 1, 1, '2026-01-05'), t('A', 'buy', 1, 1, '2026-01-09'), t('A', 'buy', 1, 1, '2026-01-12')])).toEqual([]);
  });

  describe('pre-mortem', () => {
    const base = { txns: ctx.txns, seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets, positions: ctx.positions, riskProfile: 'Moderate' };
    it('flags a sell right after a crash as high risk and requires a cooldown', () => {
      const day = '2026-04-12'; // inside the planted crash
      const series = ctx.seriesBySymbol.get('DEMO_BTC');
      const r = runPremortem({ ...base, symbol: 'DEMO_BTC', side: 'sell', quantity: 0.01, series: series.filter(s => s.day <= day), asset: ctx.assets.get('DEMO_BTC'), today: day,
        positions: [{ symbol: 'DEMO_BTC', quantity: 1, avgCost: 1, value: 10000, weight: 0.3, assetClass: 'crypto', oldestLotDays: 100 }] });
      expect(r.error).toBeUndefined();
      expect(['medium', 'high']).toContain(r.riskLevel);
      expect(r.signals.some(s => s.key === 'sharp_drop' || s.key === 'month_drop')).toBe(true);
      if (r.riskLevel === 'high') expect(r.cooldownHours).toBe(24);
    });
    it('refuses to sell more than held', () => {
      const r = runPremortem({ ...base, symbol: 'DEMO_BTC', side: 'sell', quantity: 1e9, series: ctx.seriesBySymbol.get('DEMO_BTC'), asset: ctx.assets.get('DEMO_BTC'), today: TODAY });
      expect(r.error).toBeTruthy();
    });
    it('flags crypto buys that break the guideline', () => {
      const r = runPremortem({ ...base, symbol: 'DEMO_BTC', side: 'buy', quantity: 1000, price: 1000, series: ctx.seriesBySymbol.get('DEMO_BTC'), asset: ctx.assets.get('DEMO_BTC'), today: TODAY });
      expect(r.signals.some(s => s.key === 'crypto_cap')).toBe(true);
    });
  });

  describe('council', () => {
    const rsiMap = new Map();
    const run = q => runCouncil({ positions: ctx.positions, allocation: ctx.allocation, total: ctx.totals.value, health: ctx.health, rsi: rsiMap, riskProfile: 'Conservative', behavior, premortem: null, goals: [], now: TODAY, knownSymbols: ['DEMO_BTC'] }, q);
    it('parses intents', () => {
      expect(parseQuestion('should I sell DEMO_BTC?', ctx.positions, ['DEMO_BTC'])).toEqual({ action: 'sell', symbol: 'DEMO_BTC' });
      expect(parseQuestion('buy more', ctx.positions, [])).toEqual({ action: 'buy', symbol: null });
      expect(parseQuestion('', ctx.positions, []).action).toBe('rebalance');
    });
    it('always returns four agents, a moderator and a disclaimer', () => {
      const r = run('should I sell DEMO_BTC?');
      expect(r.agents.map(a => a.id)).toEqual(['risk', 'behavior', 'tax', 'goals']);
      expect(['lean_support', 'lean_oppose', 'mixed']).toContain(r.moderator.consensus);
      expect(r.disclaimer).toMatch(/not investment/i);
      expect(r.agents.every(a => a.confidence >= 0 && a.confidence <= 1)).toBe(true);
    });
    it('Risk Officer supports trimming an over-limit crypto holding for a Conservative profile', () => {
      const r = run('sell DEMO_BTC');
      expect(r.agents.find(a => a.id === 'risk').stance).toBe('support');
    });
  });
});

describe('digital twin', () => {
  const w = { equity: 0.5, crypto: 0.25, bond: 0.25 };
  const opts = { startValue: 100000, monthlyContribution: 1000, years: 8, scenario: 'crash', paths: 120, seed: 5 };
  it('is deterministic for a seed', () => {
    const a = runTwin(w, { panicProb: 0.6, panicThreshold: -0.15, reentryMonths: 6 }, opts);
    const b = runTwin(w, { panicProb: 0.6, panicThreshold: -0.15, reentryMonths: 6 }, opts);
    expect(a.habit.finalMedian).toBe(b.habit.finalMedian);
  });
  it('with zero panic probability habits equal discipline', () => {
    const r = runTwin(w, { panicProb: 0, panicThreshold: -0.15, reentryMonths: 6 }, opts);
    expect(r.costOfHabits).toBe(0);
  });
  it('panic selling through a crash costs money in the median case', () => {
    const r = runTwin(w, { panicProb: 1, panicThreshold: -0.12, reentryMonths: 6 }, opts);
    expect(r.costOfHabits).toBeGreaterThan(0);
    expect(r.disciplined.bands.at(-1).p10).toBeLessThanOrEqual(r.disciplined.bands.at(-1).p90);
  });
  it('derives habits from behaviour', () => {
    expect(habitsFromBehavior({ status: 'insufficient_data' }).derived).toBe(false);
    const h = habitsFromBehavior({ status: 'ok', evidence: { panicSells: 2 }, stats: { sells: 2 }, traits: { patience: 20 } });
    expect(h.panicProb).toBeGreaterThan(0.5);
  });
  it('PRNG is in [0,1)', () => { const r = mulberry32(1); for (let i = 0; i < 1000; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); } });
});

describe('misc', () => {
  it('levels', () => {
    expect(levelFromXP(0).level).toBe(1);
    expect(levelFromXP(500).level).toBe(2);
    expect(levelFromXP(10 ** 6).level).toBe(10);
  });
});
