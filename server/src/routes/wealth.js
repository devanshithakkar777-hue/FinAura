import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr, isValidDay } from '../lib/dates.js';
import { loadPortfolioContext } from '../services/context.js';
import { holdingView, loanView, avalanchePlan, computeNetWorth } from '../engines/wealth.js';
import { awardXp, evaluateAchievements } from '../services/gamify.js';
import { audit } from './auth.js';

const day = z.string().refine(isValidDay, 'Use YYYY-MM-DD');
const money = z.number().min(0).max(1e13);
const KINDS = ['fd', 'pf', 'sgb', 'gsec', 'silver', 'reit', 'real_estate', 'esop'];
const LOAN_KINDS = ['home', 'auto', 'personal', 'education', 'credit_card', 'other'];

const holdingBase = z.object({
  kind: z.enum(KINDS), name: z.string().trim().min(1).max(80),
  invested: money, currentValue: money.optional(), rate: z.number().min(0).max(100).optional(),
  annualIncome: money.optional(), startDate: day, maturityDate: day.optional(), note: z.string().trim().max(200).optional(),
});
const holdingInput = holdingBase.superRefine((h, ctx) => {
  if (h.kind === 'fd' && h.rate == null) ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Interest rate is required for a fixed deposit' });
  if (h.kind !== 'fd' && h.currentValue == null) ctx.addIssue({ code: 'custom', path: ['currentValue'], message: 'Current value is required' });
  if (h.maturityDate && h.maturityDate < h.startDate) ctx.addIssue({ code: 'custom', path: ['maturityDate'], message: 'Maturity must be after the start date' });
  if (h.startDate > todayStr()) ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Start date cannot be in the future' });
});
const holdingPatch = holdingBase.omit({ kind: true, startDate: true }).partial();

const loanBase = z.object({
  kind: z.enum(LOAN_KINDS), name: z.string().trim().min(1).max(80),
  outstanding: money, rate: z.number().min(0).max(100), emi: money,
});
const loanPatch = loanBase.omit({ kind: true }).partial();

export const profileInput = z.object({
  age: z.number().int().min(18).max(90).nullable().optional(),
  retirementAge: z.number().int().min(30).max(90).nullable().optional(),
  annualIncome: money.nullable().optional(),
  monthlyExpenses: money.nullable().optional(),
  dependents: z.number().int().min(0).max(20).optional(),
}).strict();

export const profileView = p => ({
  age: p?.age ?? null, retirementAge: p?.retirement_age ?? null,
  annualIncome: p?.annual_income == null ? null : Number(p.annual_income),
  monthlyExpenses: p?.monthly_expenses == null ? null : Number(p.monthly_expenses),
  dependents: p?.dependents ?? 0,
});

export async function loadProfile(db, userId) {
  return (await db.query('SELECT * FROM financial_profile WHERE user_id = $1', [userId])).rows[0] ?? null;
}
export async function loadHoldings(db, userId, today) {
  return (await db.query('SELECT * FROM manual_holdings WHERE user_id = $1 ORDER BY created_at', [userId])).rows.map(h => holdingView(h, today));
}
export async function loadLoans(db, userId, today) {
  return (await db.query('SELECT * FROM liabilities WHERE user_id = $1 ORDER BY rate DESC, created_at', [userId])).rows.map(l => loanView(l, today));
}

const MAX_ROWS = 200;

export async function wealthRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const idParam = z.object({ id: z.string().uuid() });

  async function afterWrite(req, today) {
    const ctx = await loadPortfolioContext(pool, req.user, today);
    return evaluateAchievements(pool, req.user.id, ctx, today);
  }

  // ── Profile ──────────────────────────────────────────────────────
  app.get('/profile', auth, async (req) => ({ profile: profileView(await loadProfile(pool, req.user.id)) }));
  app.put('/profile', auth, async (req) => {
    const b = profileInput.parse(req.body);
    const cur = profileView(await loadProfile(pool, req.user.id));
    const m = { ...cur, ...b };
    if (m.age && m.retirementAge && m.retirementAge <= m.age) throw new HttpError(400, 'Retirement age must be above your current age', 'bad_retirement_age');
    await pool.query(
      `INSERT INTO financial_profile (user_id, age, retirement_age, annual_income, monthly_expenses, dependents)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET age=$2, retirement_age=$3, annual_income=$4, monthly_expenses=$5, dependents=$6, updated_at=now()`,
      [req.user.id, m.age, m.retirementAge, m.annualIncome, m.monthlyExpenses, m.dependents]);
    return { profile: m };
  });

  // ── Manual holdings ──────────────────────────────────────────────
  app.get('/holdings', auth, async (req) => {
    const holdings = await loadHoldings(pool, req.user.id, todayStr());
    return { holdings, total: holdings.reduce((s, h) => s + h.value, 0) };
  });
  app.post('/holdings', auth, async (req, reply) => {
    const b = holdingInput.parse(req.body);
    const n = (await pool.query('SELECT count(*)::int AS n FROM manual_holdings WHERE user_id = $1', [req.user.id])).rows[0].n;
    if (n >= MAX_ROWS) throw new HttpError(422, 'Holding limit reached', 'holding_limit');
    const r = (await pool.query(
      `INSERT INTO manual_holdings (user_id, kind, name, invested, current_value, rate, annual_income, start_date, maturity_date, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, b.kind, b.name, b.invested, b.kind === 'fd' ? null : b.currentValue, b.rate ?? null, b.annualIncome ?? null, b.startDate, b.maturityDate ?? null, b.note ?? null])).rows[0];
    await audit(pool, req.user.id, 'holding_created', { id: r.id, kind: b.kind }, req.ip);
    const unlocked = await afterWrite(req, todayStr());
    return reply.status(201).send({ holding: holdingView(r, todayStr()), unlocked });
  });
  app.patch('/holdings/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = holdingPatch.parse(req.body);
    const cur = (await pool.query('SELECT * FROM manual_holdings WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!cur) throw new HttpError(404, 'Holding not found', 'not_found');
    const m = {
      name: b.name ?? cur.name, invested: b.invested ?? cur.invested,
      current_value: cur.kind === 'fd' ? null : (b.currentValue ?? cur.current_value),
      rate: b.rate ?? cur.rate, annual_income: b.annualIncome ?? cur.annual_income,
      maturity_date: b.maturityDate ?? cur.maturity_date, note: b.note ?? cur.note,
    };
    const r = (await pool.query(
      `UPDATE manual_holdings SET name=$3, invested=$4, current_value=$5, rate=$6, annual_income=$7, maturity_date=$8, note=$9, updated_at=now()
        WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, req.user.id, m.name, m.invested, m.current_value, m.rate, m.annual_income, m.maturity_date, m.note])).rows[0];
    return { holding: holdingView(r, todayStr()) };
  });
  app.delete('/holdings/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await pool.query('DELETE FROM manual_holdings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Holding not found', 'not_found');
    return { ok: true };
  });

  // ── Liabilities ──────────────────────────────────────────────────
  app.get('/liabilities', auth, async (req) => {
    const loans = await loadLoans(pool, req.user.id, todayStr());
    return {
      loans, totalOutstanding: loans.reduce((s, l) => s + l.outstanding, 0), totalEmi: loans.reduce((s, l) => s + l.emi, 0),
      totalMonthlyInterest: loans.reduce((s, l) => s + l.monthlyInterest, 0),
    };
  });
  app.post('/liabilities', auth, async (req, reply) => {
    const b = loanBase.parse(req.body);
    const n = (await pool.query('SELECT count(*)::int AS n FROM liabilities WHERE user_id = $1', [req.user.id])).rows[0].n;
    if (n >= MAX_ROWS) throw new HttpError(422, 'Loan limit reached', 'loan_limit');
    const r = (await pool.query(
      'INSERT INTO liabilities (user_id, kind, name, outstanding, rate, emi) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, b.kind, b.name, b.outstanding, b.rate, b.emi])).rows[0];
    await audit(pool, req.user.id, 'liability_created', { id: r.id, kind: b.kind }, req.ip);
    return reply.status(201).send({ loan: loanView(r, todayStr()) });
  });
  app.patch('/liabilities/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = loanPatch.parse(req.body);
    const cur = (await pool.query('SELECT * FROM liabilities WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!cur) throw new HttpError(404, 'Loan not found', 'not_found');
    const r = (await pool.query(
      'UPDATE liabilities SET name=$3, outstanding=$4, rate=$5, emi=$6, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
      [id, req.user.id, b.name ?? cur.name, b.outstanding ?? cur.outstanding, b.rate ?? cur.rate, b.emi ?? cur.emi])).rows[0];
    return { loan: loanView(r, todayStr()) };
  });
  app.delete('/liabilities/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await pool.query('DELETE FROM liabilities WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Loan not found', 'not_found');
    return { ok: true };
  });
  app.get('/liabilities/plan', auth, async (req) => {
    const { extra } = z.object({ extra: z.coerce.number().min(0).max(1e8).default(0) }).parse(req.query);
    const rows = (await pool.query('SELECT * FROM liabilities WHERE user_id = $1', [req.user.id])).rows;
    return { plan: avalanchePlan(rows, extra) };
  });

  // ── Net worth ────────────────────────────────────────────────────
  app.get('/networth', auth, async (req) => {
    const today = todayStr();
    const [ctx, holdings, loans, profile] = await Promise.all([
      loadPortfolioContext(pool, req.user, today), loadHoldings(pool, req.user.id, today),
      loadLoans(pool, req.user.id, today), loadProfile(pool, req.user.id),
    ]);
    return { currency: req.user.currency, ...computeNetWorth({ market: ctx, holdings, loans, profile }) };
  });

  void awardXp;
}
