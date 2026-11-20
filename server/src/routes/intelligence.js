import { z } from 'zod';
import { todayStr } from '../lib/dates.js';
import { explain } from '../lib/explain.js';
import { hashSeed } from '../engines/twin.js';
import { simulateLife, lifeStateFrom, LIFE_EXPECTANCY } from '../engines/lifemodel.js';
import { CATALOG, catalogView, compareScenarios, levers } from '../engines/scenarios.js';
import { stressTest, stressCatalog, STRESS } from '../engines/stress.js';
import { loadWealthState } from './planning.js';

const GROUPS = ['equity', 'mutualFund', 'crypto', 'bond', 'gold', 'cash', 'realEstate'];

export async function intelligenceRoutes(app) {
  const { pool } = app;
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  const auth = { preHandler: app.requireAuth };

  const seedFor = user => hashSeed(String(user.id));

  // ── Predictive digital twin of the whole financial life ──────────
  app.get('/twin/life', heavy, async (req) => {
    const s = await loadWealthState(pool, req.user);
    const state = lifeStateFrom(s);
    const opts = { paths: 300, seed: seedFor(req.user) };
    const base = simulateLife(state, [], opts);
    const lev = levers(state, { paths: 150, seed: opts.seed });
    const p = base.probabilityFundsLast;
    const netWorthNow = s.nw.netWorth;
    await pool.query(
      `INSERT INTO twin_snapshots (user_id, day, net_worth, projected_final, prob_funds_last, inputs) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, day) DO UPDATE SET net_worth=$3, projected_final=$4, prob_funds_last=$5, inputs=$6`,
      [req.user.id, todayStr(), Math.round(netWorthNow), base.finalNetWorth.p50, p, { age: state.age, retirementAge: state.retirementAge, assumed: state.assumed }]);
    return {
      currency: req.user.currency, netWorthNow, state: { ...state, debts: undefined, debtCount: state.debts.length },
      projection: base, levers: lev,
      readiness: {
        probabilityFundsLast: p, status: p >= 0.85 ? 'strong' : p >= 0.65 ? 'fair' : 'at_risk', medianDepletionAge: base.medianDepletionAge,
        explain: explain({
          title: 'Retirement readiness', verdict: `In ${Math.round(p * 100)}% of simulated futures your money lasts to age ${LIFE_EXPECTANCY}.`,
          why: [`You retire at ${base.retirementAge} with a median of ${Math.round(base.liquidAtRetirement).toLocaleString('en-IN')} in investments and cash (future rupees).`, `Money is projected to run short at a median age of ${base.medianDepletionAge ?? 'never in the simulation'}.`],
          inputs: { age: state.age, retirementAge: state.retirementAge, income: state.annualIncome, expenses: state.monthlyExpenses, portfolio: state.portfolio, cash: state.cash, debts: state.debts.length, assumedReturn: state.mu, assumedVolatility: state.sigma },
          risks: ['A bad market in the first years of retirement hurts far more than the same drop later.', 'Healthcare costs and inflation above 6% are not stress-tested here.'],
          alternatives: lev.slice(0, 3).map(l => `${l.label}: chance moves ${l.delta >= 0 ? '+' : ''}${Math.round(l.delta * 100)} points`),
          confidence: state.assumed.length > 2 ? 0.3 : state.assumed.length ? 0.45 : 0.6,
          uncertainty: state.assumed.length ? `Assumed because missing: ${state.assumed.join(', ')}.` : 'Outcomes span a wide range; treat the percentages as a gauge, not a promise.',
        }),
      },
    };
  });

  app.get('/twin/life/history', auth, async (req) => {
    const { rows } = await pool.query('SELECT day, net_worth, projected_final, prob_funds_last FROM twin_snapshots WHERE user_id = $1 ORDER BY day DESC LIMIT 120', [req.user.id]);
    return { snapshots: rows.reverse().map(r => ({ day: String(r.day).slice(0, 10), netWorth: Number(r.net_worth), projectedFinal: Number(r.projected_final), probabilityFundsLast: Number(r.prob_funds_last) })) };
  });

  // ── What-if simulator ────────────────────────────────────────────
  app.get('/whatif/catalog', auth, async () => ({ scenarios: catalogView() }));

  app.post('/whatif', heavy, async (req) => {
    const body = z.object({
      picks: z.array(z.object({ kind: z.enum(Object.keys(CATALOG)), params: z.record(z.string(), z.coerce.number()).default({}) })).min(1).max(4),
    }).parse(req.body);
    const s = await loadWealthState(pool, req.user);
    return compareScenarios(lifeStateFrom(s), body.picks, { paths: 250, seed: seedFor(req.user) });
  });

  // ── Portfolio stress testing ─────────────────────────────────────
  app.get('/stress', heavy, async (req) => {
    const s = await loadWealthState(pool, req.user);
    return { catalog: stressCatalog(), ...stressTest(s.nw, s.profile) };
  });
  app.post('/stress/custom', heavy, async (req) => {
    const { shocks } = z.object({ shocks: z.partialRecord(z.enum(GROUPS), z.number().min(-0.95).max(2)) }).parse(req.body);
    const s = await loadWealthState(pool, req.user);
    return stressTest(s.nw, s.profile, undefined, shocks);
  });
  void STRESS;
}
