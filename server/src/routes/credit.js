import { z } from 'zod';
import { todayStr, isValidDay } from '../lib/dates.js';
import { HttpError } from '../lib/security.js';
import { loadProfile, profileView } from './wealth.js';
import { creditHealth, loanAffordability, emiOptions, balanceTransfer, strategyCompare, TAKE_HOME } from '../engines/credit.js';

const view = r => r ? { totalLimit: r.total_limit == null ? null : Number(r.total_limit), utilised: r.utilised == null ? null : Number(r.utilised), enquiries6m: r.enquiries_6m, missedPayments12m: r.missed_payments_12m, oldestAccountYears: r.oldest_account_years == null ? null : Number(r.oldest_account_years) } : null;
const num = (lo, hi, d) => (d === undefined ? z.coerce.number().min(lo).max(hi) : z.coerce.number().min(lo).max(hi).default(d));

export async function creditRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };

  async function state(user) {
    const [p, s, l, prof] = await Promise.all([
      pool.query('SELECT * FROM credit_profile WHERE user_id = $1', [user.id]),
      pool.query('SELECT day, score FROM credit_scores WHERE user_id = $1 ORDER BY day', [user.id]),
      pool.query('SELECT * FROM liabilities WHERE user_id = $1', [user.id]),
      loadProfile(pool, user.id),
    ]);
    const profile = profileView(prof), loans = l.rows;
    return { profile, credit: view(p.rows[0]), scores: s.rows.map(r => ({ day: String(r.day).slice(0, 10), score: r.score })), loans, monthlyEmi: loans.reduce((a, x) => a + Number(x.emi), 0), income: profile.annualIncome ?? 0 };
  }

  app.get('/credit', auth, async (req) => {
    const s = await state(req.user);
    return { health: creditHealth({ profile: s.credit, scores: s.scores, monthlyEmi: s.monthlyEmi, annualIncome: s.income }), scores: s.scores, profile: s.credit, monthlyEmi: s.monthlyEmi };
  });

  app.put('/credit/profile', auth, async (req) => {
    const b = z.object({ totalLimit: z.number().min(0).max(1e10).nullable(), utilised: z.number().min(0).max(1e10).nullable(), enquiries6m: z.number().int().min(0).max(100).nullable(), missedPayments12m: z.number().int().min(0).max(100).nullable(), oldestAccountYears: z.number().min(0).max(80).nullable() }).partial().strict().parse(req.body);
    const cur = view((await pool.query('SELECT * FROM credit_profile WHERE user_id = $1', [req.user.id])).rows[0]) ?? {};
    const m = { ...cur, ...b };
    if (m.totalLimit != null && m.utilised != null && m.utilised > m.totalLimit * 1.5) throw new HttpError(400, 'Utilised amount is far above the limit; check the figures', 'bad_utilisation');
    await pool.query(`INSERT INTO credit_profile (user_id, total_limit, utilised, enquiries_6m, missed_payments_12m, oldest_account_years) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET total_limit=$2, utilised=$3, enquiries_6m=$4, missed_payments_12m=$5, oldest_account_years=$6, updated_at=now()`,
      [req.user.id, m.totalLimit ?? null, m.utilised ?? null, m.enquiries6m ?? null, m.missedPayments12m ?? null, m.oldestAccountYears ?? null]);
    return { profile: m };
  });

  app.post('/credit/scores', auth, async (req) => {
    const b = z.object({ score: z.number().int().min(300).max(900), day: z.string().refine(isValidDay).optional() }).parse(req.body);
    const day = b.day ?? todayStr();
    if (day > todayStr()) throw new HttpError(400, 'Date cannot be in the future', 'future_date');
    await pool.query(`INSERT INTO credit_scores (user_id, day, score) VALUES ($1,$2,$3) ON CONFLICT (user_id, day) DO UPDATE SET score = $3`, [req.user.id, day, b.score]);
    return { ok: true };
  });

  app.get('/credit/affordability', auth, async (req) => {
    const q = z.object({ rate: num(1, 40, 9), years: num(1, 40, 20), foir: num(0.2, 0.6, 0.45) }).parse(req.query);
    const s = await state(req.user);
    return loanAffordability({ annualIncome: s.income, existingEmi: s.monthlyEmi, ...q });
  });

  app.get('/credit/emi-options', auth, async (req) => {
    const q = z.object({ principal: num(1000, 1e10), rate: num(1, 40, 9) }).parse(req.query);
    const s = await state(req.user);
    return emiOptions({ ...q, takeHome: s.income ? s.income / 12 * TAKE_HOME - s.monthlyEmi : null });
  });

  app.get('/credit/transfer', auth, async (req) => {
    const q = z.object({ outstanding: num(1000, 1e10), currentRate: num(1, 40), newRate: num(1, 40), remainingMonths: num(1, 480), feePct: num(0, 5, 0.5) }).parse(req.query);
    return balanceTransfer(q);
  });

  app.get('/credit/strategies', auth, async (req) => {
    const { extra } = z.object({ extra: num(0, 1e8, 0) }).parse(req.query);
    const s = await state(req.user);
    return strategyCompare(s.loans, extra);
  });
}
