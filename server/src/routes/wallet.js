import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr, isValidDay, addDays } from '../lib/dates.js';
import { parseCsv } from '../lib/csv.js';
import { loadPortfolioContext } from '../services/context.js';
import { CATEGORIES, categorize, cashflowAnalysis, detectSubscriptions, detectAnomalies, concentrationAnomalies, budgetStatus, parseBankCsv } from '../engines/wallet.js';
import { audit } from './auth.js';

const day = z.string().refine(isValidDay, 'Use YYYY-MM-DD');
const txnInput = z.object({
  day, amount: z.number().positive().max(1e10), direction: z.enum(['in', 'out']),
  merchant: z.string().trim().max(80).optional(), description: z.string().trim().max(200).optional(), category: z.enum(CATEGORIES).optional(),
});
const view = r => ({ id: r.id, day: String(r.day).slice(0, 10), amount: Number(r.amount), direction: r.direction, category: r.category, merchant: r.merchant, description: r.description });
const MAX_IMPORT = 2000;

export async function walletRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const idParam = z.object({ id: z.string().uuid() });

  const recent = async (userId, days = 400) =>
    (await pool.query('SELECT * FROM cash_txns WHERE user_id = $1 AND day >= $2 ORDER BY day, created_at LIMIT 20000', [userId, addDays(todayStr(), -days)])).rows.map(view);

  app.get('/cash/txns', auth, async (req) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
    const rows = month
      ? (await pool.query(`SELECT * FROM cash_txns WHERE user_id = $1 AND to_char(day,'YYYY-MM') = $2 ORDER BY day DESC, created_at DESC`, [req.user.id, month])).rows
      : (await pool.query('SELECT * FROM cash_txns WHERE user_id = $1 ORDER BY day DESC, created_at DESC LIMIT 300', [req.user.id])).rows;
    return { transactions: rows.map(view), categories: CATEGORIES };
  });

  app.post('/cash/txns', auth, async (req, reply) => {
    const b = txnInput.parse(req.body);
    if (b.day > todayStr()) throw new HttpError(400, 'Date cannot be in the future', 'future_date');
    const category = b.category ?? categorize(b.description, b.merchant, b.direction);
    const r = (await pool.query('INSERT INTO cash_txns (user_id, day, amount, direction, category, merchant, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, b.day, b.amount, b.direction, category, b.merchant ?? null, b.description ?? null])).rows[0];
    return reply.status(201).send({ transaction: view(r) });
  });

  app.patch('/cash/txns/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const { category } = z.object({ category: z.enum(CATEGORIES) }).parse(req.body);
    const r = await pool.query('UPDATE cash_txns SET category = $3 WHERE id = $1 AND user_id = $2 RETURNING *', [id, req.user.id, category]);
    if (!r.rowCount) throw new HttpError(404, 'Transaction not found', 'not_found');
    return { transaction: view(r.rows[0]) };
  });

  app.delete('/cash/txns/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await pool.query('DELETE FROM cash_txns WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Transaction not found', 'not_found');
    return { ok: true };
  });

  app.post('/cash/import', { ...heavy }, async (req) => {
    const { csv } = z.object({ csv: z.string().min(1).max(1_500_000) }).parse(req.body);
    const parsed = parseBankCsv(parseCsv(csv));
    if (!parsed.rows.length) throw new HttpError(400, 'No valid rows. Expected columns: date, description, and either amount (+type) or debit/credit.', 'empty_csv', { errors: parsed.errors.slice(0, 20) });
    if (parsed.rows.length > MAX_IMPORT) throw new HttpError(422, `At most ${MAX_IMPORT} rows per import`, 'too_many_rows');
    if (parsed.rows.some(r => r.day > todayStr())) throw new HttpError(400, 'Rows contain future dates', 'future_date');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of parsed.rows) {
        await client.query(`INSERT INTO cash_txns (user_id, day, amount, direction, category, merchant, description, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'import')`,
          [req.user.id, r.day, r.amount, r.direction, categorize(r.description, r.merchant, r.direction), r.merchant, r.description]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    await audit(pool, req.user.id, 'cash_imported', { count: parsed.rows.length }, req.ip);
    return { imported: parsed.rows.length, skipped: parsed.errors.length, errors: parsed.errors.slice(0, 20) };
  });

  // Ask the LLM to categorise leftovers; the rule engine stays the default.
  app.post('/cash/recategorise', heavy, async (req) => {
    if (!app.llm.enabled) return { updated: 0, llm: false };
    const rows = (await pool.query(`SELECT id, merchant, description, direction FROM cash_txns WHERE user_id = $1 AND category = 'Other' ORDER BY day DESC LIMIT 40`, [req.user.id])).rows;
    if (!rows.length) return { updated: 0, llm: true };
    const out = await app.llm.classify({
      userId: req.user.id, kind: 'categorise',
      instruction: `Assign each item one category from: ${CATEGORIES.join(', ')}. Reply {"results":[{"id":"...","category":"..."}]}. Use "Other" when unsure.`,
      items: rows.map(r => ({ id: r.id, merchant: r.merchant, description: r.description, direction: r.direction })),
      schema: z.object({ results: z.array(z.object({ id: z.string(), category: z.string() })) }),
    });
    if (!out) return { updated: 0, llm: true };
    const ok = new Set(rows.map(r => r.id)); let updated = 0;
    for (const x of out.results) if (ok.has(x.id) && CATEGORIES.includes(x.category) && x.category !== 'Other') {
      updated += (await pool.query('UPDATE cash_txns SET category = $3 WHERE id = $1 AND user_id = $2', [x.id, req.user.id, x.category])).rowCount;
    }
    return { updated, llm: true };
  });

  app.get('/cash/analysis', auth, async (req) => {
    const today = todayStr(), txns = await recent(req.user.id);
    const budgets = (await pool.query('SELECT category, monthly_limit FROM budgets WHERE user_id = $1', [req.user.id])).rows;
    return { analysis: cashflowAnalysis(txns, today), subscriptions: detectSubscriptions(txns, today), budgets: budgetStatus(txns, budgets, today) };
  });

  app.get('/cash/subscriptions', auth, async (req) => detectSubscriptions(await recent(req.user.id), todayStr()));

  app.get('/anomalies', auth, async (req) => {
    const today = todayStr(), txns = await recent(req.user.id);
    const subs = detectSubscriptions(txns, today).subscriptions;
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const anomalies = [...detectAnomalies(txns, today, subs), ...concentrationAnomalies(ctx.positions, ctx.allocation)];
    return { anomalies, checked: { cashTransactions: txns.length, positions: ctx.positions.length } };
  });

  app.get('/cash/budgets', auth, async (req) => {
    const { rows } = await pool.query('SELECT category, monthly_limit FROM budgets WHERE user_id = $1 ORDER BY category', [req.user.id]);
    return { budgets: rows.map(b => ({ category: b.category, monthlyLimit: Number(b.monthly_limit) })) };
  });
  app.put('/cash/budgets', auth, async (req) => {
    const { category, monthlyLimit } = z.object({ category: z.enum(CATEGORIES), monthlyLimit: z.number().min(0).max(1e9) }).parse(req.body);
    await pool.query('INSERT INTO budgets (user_id, category, monthly_limit) VALUES ($1,$2,$3) ON CONFLICT (user_id, category) DO UPDATE SET monthly_limit = $3', [req.user.id, category, monthlyLimit]);
    return { ok: true };
  });
  app.delete('/cash/budgets/:category', auth, async (req) => {
    const { category } = z.object({ category: z.enum(CATEGORIES) }).parse(req.params);
    await pool.query('DELETE FROM budgets WHERE user_id = $1 AND category = $2', [req.user.id, category]);
    return { ok: true };
  });
}
