import { z } from 'zod';
import { todayStr } from '../lib/dates.js';
import { loadPortfolioContext } from '../services/context.js';
import { loadProfile, profileView } from './wealth.js';
import { TAX_YEAR, compareRegimes, savingOpportunities, capitalGainsReport, harvestingPlan, documentChecklist, fyOf, DOC_CHECKLIST } from '../engines/tax.js';

const amt = z.number().min(0).max(1e10);
export const taxInputSchema = z.object({
  otherIncome: amt, basic: amt, hraReceived: amt, rentPaid: amt, metro: z.boolean(), c80: amt, d80Self: amt, d80Parents: amt, seniorParents: z.boolean(),
  nps1b: amt, employerNps: amt, homeLoanInterest: amt, tdsPaid: amt, hasForeign: z.boolean(),
}).partial().strict();

export async function taxRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const fyParam = z.object({ fy: z.string().regex(/^\d{4}-\d{2}$/).optional() });

  async function load(user) {
    const row = (await pool.query('SELECT data FROM tax_inputs WHERE user_id = $1', [user.id])).rows[0];
    const profile = profileView(await loadProfile(pool, user.id));
    const data = row?.data ?? {};
    return { data, inputs: { grossIncome: profile.annualIncome ?? 0, ...data } };
  }
  const slabFrom = reg => (reg.ready ? reg[reg.better].marginalRate : 0.30);

  app.get('/tax/inputs', auth, async (req) => { const { data, inputs } = await load(req.user); return { taxYear: TAX_YEAR, inputs: data, grossIncome: inputs.grossIncome }; });
  app.put('/tax/inputs', auth, async (req) => {
    const b = taxInputSchema.parse(req.body);
    const cur = (await pool.query('SELECT data FROM tax_inputs WHERE user_id = $1', [req.user.id])).rows[0]?.data ?? {};
    const data = { ...cur, ...b };
    await pool.query(`INSERT INTO tax_inputs (user_id, data) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now()`, [req.user.id, data]);
    return { inputs: data };
  });

  app.get('/tax/regimes', auth, async (req) => { const { inputs } = await load(req.user); return { taxYear: TAX_YEAR, comparison: compareRegimes(inputs), savings: inputs.grossIncome ? savingOpportunities(inputs) : null }; });

  app.get('/tax/capital-gains', auth, async (req) => {
    const { fy = fyOf(todayStr()) } = fyParam.parse(req.query);
    const { inputs } = await load(req.user), ctx = await loadPortfolioContext(pool, req.user, todayStr());
    return capitalGainsReport({ txns: ctx.txns, assets: ctx.assets, fy, slabRate: slabFrom(compareRegimes(inputs)) });
  });

  app.get('/tax/harvest', auth, async (req) => {
    const { fy = fyOf(todayStr()) } = fyParam.parse(req.query);
    const { inputs } = await load(req.user), today = todayStr(), ctx = await loadPortfolioContext(pool, req.user, today);
    return harvestingPlan({ txns: ctx.txns, assets: ctx.assets, priceNow: ctx.priceNow, today, fy, slabRate: slabFrom(compareRegimes(inputs)) });
  });

  app.get('/tax/documents', auth, async (req) => {
    const { data, inputs } = await load(req.user), ctx = await loadPortfolioContext(pool, req.user, todayStr());
    return { documents: documentChecklist({ ...inputs, hasTrades: ctx.txns.length > 0 }, data.docs) };
  });
  app.put('/tax/documents', auth, async (req) => {
    const { key, done } = z.object({ key: z.enum(DOC_CHECKLIST.map(d => d.key)), done: z.boolean() }).parse(req.body);
    const cur = (await pool.query('SELECT data FROM tax_inputs WHERE user_id = $1', [req.user.id])).rows[0]?.data ?? {};
    const data = { ...cur, docs: { ...(cur.docs ?? {}), [key]: done } };
    await pool.query(`INSERT INTO tax_inputs (user_id, data) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = now()`, [req.user.id, data]);
    return { ok: true };
  });

  app.get('/tax/overview', auth, async (req) => {
    const today = todayStr(), fy = fyOf(today), { inputs } = await load(req.user), ctx = await loadPortfolioContext(pool, req.user, today);
    const comparison = compareRegimes(inputs), slabRate = slabFrom(comparison);
    const cg = capitalGainsReport({ txns: ctx.txns, assets: ctx.assets, fy, slabRate });
    const incomeTax = comparison.ready ? comparison[comparison.better].totalTax : 0;
    return { taxYear: TAX_YEAR, comparison, capitalGains: { fy, tax: cg.tax, exemptionHeadroom: cg.exemptionHeadroom, net: cg.net }, estimatedTotalTax: incomeTax + cg.tax, savings: inputs.grossIncome ? savingOpportunities(inputs) : null };
  });
}
