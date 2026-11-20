import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr, isValidDay } from '../lib/dates.js';
import { loadPortfolioContext } from '../services/context.js';
import { computeNetWorth } from '../engines/wealth.js';
import { loadHoldings, loadLoans, loadProfile, profileView } from './wealth.js';
import { retirementPlan, emergencyFund, wealthProjection, rebalance, signalFor, blendedReturn, insuranceAnalysis, comparePolicies, INSURANCE_KINDS } from '../engines/planning.js';
import { audit } from './auth.js';

const day = z.string().refine(isValidDay, 'Use YYYY-MM-DD');
const money = z.number().min(0).max(1e13);
const policyBase = z.object({
  kind: z.enum(INSURANCE_KINDS), insurer: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(80),
  sumAssured: money, annualPremium: money, startDate: day, termYears: z.number().int().min(1).max(80).optional(), familyFloater: z.boolean().optional(),
});
const policyView = p => ({
  id: p.id, kind: p.kind, insurer: p.insurer, name: p.name, sumAssured: Number(p.sum_assured), annualPremium: Number(p.annual_premium),
  startDate: String(p.start_date).slice(0, 10), termYears: p.term_years, familyFloater: p.family_floater,
});

/** Everything the planners need, loaded once. */
export async function loadWealthState(pool, user, today = todayStr()) {
  const [ctx, holdings, loans, profileRow, goalsRow] = await Promise.all([
    loadPortfolioContext(pool, user, today), loadHoldings(pool, user.id, today), loadLoans(pool, user.id, today), loadProfile(pool, user.id),
    pool.query('SELECT COALESCE(sum(monthly_contribution),0)::float AS m FROM goals WHERE user_id = $1', [user.id]),
  ]);
  const profile = profileView(profileRow);
  const nw = computeNetWorth({ market: ctx, holdings, loans, profile: profileRow });
  const realEstate = nw.allocation.find(a => a.group === 'realEstate')?.value ?? 0;
  return { ctx, holdings, loans, profile, nw, investable: nw.totalAssets - realEstate, goalMonthly: goalsRow.rows[0].m, today };
}

export async function planningRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const idParam = z.object({ id: z.string().uuid() });
  const num = (lo, hi, d) => z.coerce.number().min(lo).max(hi).default(d);

  app.get('/plan/retirement', auth, async (req) => {
    const q = z.object({ monthlySaving: z.coerce.number().min(0).max(1e9).optional(), retirementAge: z.coerce.number().int().min(30).max(90).optional() }).parse(req.query);
    const s = await loadWealthState(pool, req.user);
    const profile = { ...s.profile, retirementAge: q.retirementAge ?? s.profile.retirementAge };
    return { plan: retirementPlan({ profile, investable: s.investable, monthlySaving: q.monthlySaving ?? s.goalMonthly, allocation: s.nw.allocation }), investable: s.investable };
  });

  app.get('/plan/emergency', auth, async (req) => {
    const s = await loadWealthState(pool, req.user);
    return { plan: emergencyFund({ profile: s.profile, liquid: s.nw.liquidAssets, monthlyEmi: s.nw.monthlyEmi }) };
  });

  app.get('/plan/projection', auth, async (req) => {
    const q = z.object({ years: num(1, 50, 20), monthly: z.coerce.number().min(0).max(1e9).optional(), stepUp: num(0, 0.3, 0.05), rate: z.coerce.number().min(0).max(0.3).optional() }).parse(req.query);
    const s = await loadWealthState(pool, req.user);
    const rate = q.rate ?? blendedReturn(s.nw.allocation);
    const monthly = q.monthly ?? s.goalMonthly;
    return { assumptions: { startValue: s.investable, monthly, years: q.years, stepUp: q.stepUp, rate }, points: wealthProjection({ start: s.investable, monthly, years: q.years, rate, stepUp: q.stepUp }) };
  });

  app.get('/plan/rebalance', auth, async (req) => {
    const { newMoney } = z.object({ newMoney: z.coerce.number().min(0).max(1e10).default(0) }).parse(req.query);
    const s = await loadWealthState(pool, req.user);
    return { plan: rebalance({ allocation: s.nw.allocation, riskProfile: s.ctx.riskProfile, newMoney }) };
  });

  app.get('/signals', auth, async (req) => {
    const s = await loadWealthState(pool, req.user);
    const signals = s.ctx.positions.map(p => signalFor(p, s.ctx.seriesBySymbol.get(p.symbol) ?? [], s.ctx.rsi.get(p.symbol) ?? null, s.ctx.riskProfile));
    return { signals, dataQuality: s.ctx.dataQuality, note: 'Signals combine momentum, trend and concentration. They are prompts to think, not instructions to trade.' };
  });

  // ── Insurance ────────────────────────────────────────────────────
  app.get('/insurance', auth, async (req) => {
    const rows = (await pool.query('SELECT * FROM insurance_policies WHERE user_id = $1 ORDER BY created_at', [req.user.id])).rows.map(policyView);
    const s = await loadWealthState(pool, req.user);
    return { policies: rows, analysis: insuranceAnalysis({ profile: s.profile, policies: rows, debt: s.nw.totalDebt, liquidAssets: s.nw.liquidAssets }), comparison: comparePolicies(rows) };
  });
  app.post('/insurance', auth, async (req, reply) => {
    const b = policyBase.parse(req.body);
    const n = (await pool.query('SELECT count(*)::int AS n FROM insurance_policies WHERE user_id = $1', [req.user.id])).rows[0].n;
    if (n >= 100) throw new HttpError(422, 'Policy limit reached', 'policy_limit');
    const r = (await pool.query(
      `INSERT INTO insurance_policies (user_id, kind, insurer, name, sum_assured, annual_premium, start_date, term_years, family_floater)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, b.kind, b.insurer, b.name, b.sumAssured, b.annualPremium, b.startDate, b.termYears ?? null, b.familyFloater ?? false])).rows[0];
    await audit(pool, req.user.id, 'policy_created', { id: r.id, kind: b.kind }, req.ip);
    return reply.status(201).send({ policy: policyView(r) });
  });
  app.patch('/insurance/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = policyBase.omit({ kind: true, startDate: true }).partial().parse(req.body);
    const cur = (await pool.query('SELECT * FROM insurance_policies WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!cur) throw new HttpError(404, 'Policy not found', 'not_found');
    const r = (await pool.query(
      `UPDATE insurance_policies SET insurer=$3, name=$4, sum_assured=$5, annual_premium=$6, term_years=$7, family_floater=$8, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, req.user.id, b.insurer ?? cur.insurer, b.name ?? cur.name, b.sumAssured ?? cur.sum_assured, b.annualPremium ?? cur.annual_premium, b.termYears ?? cur.term_years, b.familyFloater ?? cur.family_floater])).rows[0];
    return { policy: policyView(r) };
  });
  app.delete('/insurance/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await pool.query('DELETE FROM insurance_policies WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Policy not found', 'not_found');
    return { ok: true };
  });
}
