import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr, isValidDay, monthKey } from '../lib/dates.js';
import { parseCsv } from '../lib/csv.js';
import { fetchDailyCloses } from '../lib/market.js';
import { loadPortfolioContext, valueHistory } from '../services/context.js';
import { buildLedger, OversellError } from '../engines/portfolio.js';
import { awardXp, evaluateAchievements } from '../services/gamify.js';
import { loadDemoPortfolio } from '../services/demo.js';
import { audit } from './auth.js';

const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._&-]{0,19}$/, 'Symbol: 1–20 letters, numbers, . _ & -');
const CLASSES = ['equity', 'crypto', 'mutualFund', 'bond', 'gold', 'cash'];
const DEFAULT_VOL = { equity: 'Moderate', crypto: 'High', mutualFund: 'Moderate', bond: 'Low', gold: 'Moderate', cash: 'Low' };
const MAX_USER_ASSETS = 50;
const MAX_TXNS = 5000;

const txnInput = z.object({
  symbol: symbolSchema,
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive().max(1e12),
  price: z.number().positive().max(1e12),
  date: z.string().refine(isValidDay, 'Use YYYY-MM-DD'),
  note: z.string().trim().max(280).optional(),
  // only needed when the symbol is new
  name: z.string().trim().min(1).max(80).optional(),
  assetClass: z.enum(CLASSES).optional(),
  nudgeId: z.string().uuid().optional(),
});

export async function portfolioRoutes(app) {
  const { pool, config } = app;
  const auth = { preHandler: app.requireAuth };

  /** Ensure the asset exists; create an unverified user asset if new. Returns the asset row. */
  async function ensureAsset(db, user, { symbol, name, assetClass }) {
    const found = (await db.query('SELECT * FROM assets WHERE symbol = $1', [symbol])).rows[0];
    if (found) return found;
    if (!name || !assetClass) throw new HttpError(422, `Unknown symbol ${symbol}. Provide a name and asset class to add it.`, 'unknown_asset');
    const mine = (await db.query('SELECT count(*)::int AS n FROM assets WHERE created_by = $1', [user.id])).rows[0].n;
    if (mine >= MAX_USER_ASSETS) throw new HttpError(422, 'Too many custom assets', 'asset_limit');
    return (await db.query(
      `INSERT INTO assets (symbol, name, asset_class, volatility, verified, created_by) VALUES ($1,$2,$3,$4,false,$5) RETURNING *`,
      [symbol, name, assetClass, DEFAULT_VOL[assetClass], user.id])).rows[0];
  }

  async function assertLedgerValid(txns) {
    try { buildLedger(txns); } catch (e) {
      if (e instanceof OversellError) throw new HttpError(422, e.message, 'oversell');
      throw e;
    }
  }

  app.get('/portfolio', auth, async (req) => {
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    return {
      empty: ctx.txns.length === 0,
      currency: req.user.currency,
      riskProfile: ctx.riskProfile,
      dataQuality: ctx.dataQuality,
      positions: ctx.positions,
      allocation: ctx.allocation,
      totals: ctx.totals,
      health: ctx.health,
      history: valueHistory(ctx.txns, ctx.seriesBySymbol, today),
      rsi: Object.fromEntries(ctx.rsi),
    };
  });

  app.get('/transactions', auth, async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    const { rows } = await pool.query(
      `SELECT t.id, t.symbol, a.name, a.asset_class AS "assetClass", t.side, t.quantity, t.price, t.executed_on AS date, t.note, t.source
         FROM transactions t JOIN assets a ON a.symbol = t.symbol
        WHERE t.user_id = $1 ORDER BY t.executed_on DESC, t.created_at DESC LIMIT $2 OFFSET $3`, [req.user.id, q.limit, q.offset]);
    const total = (await pool.query('SELECT count(*)::int AS n FROM transactions WHERE user_id = $1', [req.user.id])).rows[0].n;
    return { transactions: rows, total };
  });

  app.post('/transactions', auth, async (req, reply) => {
    const body = txnInput.parse(req.body);
    const today = todayStr();
    if (body.date > today) throw new HttpError(422, 'Trade date cannot be in the future', 'future_date');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const count = (await client.query('SELECT count(*)::int AS n FROM transactions WHERE user_id = $1', [req.user.id])).rows[0].n;
      if (count >= MAX_TXNS) throw new HttpError(422, 'Transaction limit reached', 'txn_limit');
      const asset = await ensureAsset(client, req.user, body);
      const existing = (await client.query('SELECT symbol, side, quantity, price, executed_on, created_at FROM transactions WHERE user_id = $1', [req.user.id])).rows;
      await assertLedgerValid([...existing, { symbol: body.symbol, side: body.side, quantity: body.quantity, price: body.price, executed_on: body.date, created_at: new Date() }]);
      const txn = (await client.query(
        `INSERT INTO transactions (user_id, symbol, side, quantity, price, executed_on, note, nudge_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, symbol, side, quantity, price, executed_on AS date, note`,
        [req.user.id, body.symbol, body.side, body.quantity, body.price, body.date, body.note ?? null, body.nudgeId ?? null])).rows[0];
      if (body.nudgeId) {
        await client.query(`UPDATE nudges SET decision = 'proceeded', resolved_at = now() WHERE id = $1 AND user_id = $2 AND decision = 'pending'`, [body.nudgeId, req.user.id]);
      }
      await client.query('COMMIT');
      let xp = await awardXp(pool, req.user.id, 'log_trade', txn.id);
      if (body.side === 'buy') xp += await awardXp(pool, req.user.id, 'sip_month', monthKey(body.date));
      const ctx = await loadPortfolioContext(pool, req.user, today);
      const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
      return reply.status(201).send({ transaction: { ...txn, name: asset.name, assetClass: asset.asset_class }, xpAwarded: xp, unlocked });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally { client.release(); }
  });

  app.delete('/transactions/:id', auth, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const all = (await pool.query('SELECT id, symbol, side, quantity, price, executed_on, created_at FROM transactions WHERE user_id = $1', [req.user.id])).rows;
    if (!all.some(t => t.id === id)) throw new HttpError(404, 'Transaction not found', 'not_found');
    await assertLedgerValid(all.filter(t => t.id !== id));
    await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    await audit(pool, req.user.id, 'transaction_deleted', { id }, req.ip);
    return { ok: true };
  });

  app.post('/transactions/import', { preHandler: app.requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { csv } = z.object({ csv: z.string().min(1).max(1_500_000) }).parse(req.body);
    const rows = parseCsv(csv);
    if (!rows.length) throw new HttpError(400, 'No rows found. Expected header: date,symbol,side,quantity,price[,name,class,note]', 'empty_csv');
    if (rows.length > 2000) throw new HttpError(400, 'Import at most 2,000 rows at a time', 'too_many_rows');
    const today = todayStr();
    const parsed = [], errors = [];
    rows.forEach((r, i) => {
      const res = txnInput.safeParse({
        symbol: r.symbol, side: (r.side || '').toLowerCase(), quantity: Number(r.quantity), price: Number(r.price),
        date: r.date, note: r.note || undefined, name: r.name || undefined, assetClass: r.class || r.assetclass || undefined,
      });
      if (!res.success) errors.push({ row: i + 2, message: res.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; ') });
      else if (res.data.date > today) errors.push({ row: i + 2, message: 'date is in the future' });
      else parsed.push(res.data);
    });
    if (errors.length) throw Object.assign(new HttpError(422, `${errors.length} row(s) are invalid`, 'invalid_rows'), { details: errors.slice(0, 20) });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = (await client.query('SELECT symbol, side, quantity, price, executed_on, created_at FROM transactions WHERE user_id = $1', [req.user.id])).rows;
      if (existing.length + parsed.length > MAX_TXNS) throw new HttpError(422, 'Transaction limit reached', 'txn_limit');
      const createdAssets = new Set();
      for (const p of parsed) {
        const had = (await client.query('SELECT 1 FROM assets WHERE symbol = $1', [p.symbol])).rowCount;
        await ensureAsset(client, req.user, p);
        if (!had) createdAssets.add(p.symbol);
      }
      await assertLedgerValid([...existing, ...parsed.map((p, i) => ({ symbol: p.symbol, side: p.side, quantity: p.quantity, price: p.price, executed_on: p.date, created_at: new Date(Date.now() + i) }))]);
      for (const p of parsed) {
        await client.query(
          `INSERT INTO transactions (user_id, symbol, side, quantity, price, executed_on, note, source) VALUES ($1,$2,$3,$4,$5,$6,$7,'import')`,
          [req.user.id, p.symbol, p.side, p.quantity, p.price, p.date, p.note ?? null]);
      }
      await client.query('COMMIT');
      const xp = await awardXp(pool, req.user.id, 'import_trades', `${Date.now()}`);
      await audit(pool, req.user.id, 'transactions_imported', { count: parsed.length }, req.ip);
      const ctx = await loadPortfolioContext(pool, req.user, today);
      const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
      return { imported: parsed.length, newAssets: [...createdAssets], xpAwarded: xp, unlocked };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally { client.release(); }
  });

  app.get('/assets', auth, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(30).default('') }).parse(req.query);
    const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
    const { rows } = await pool.query(
      `SELECT symbol, name, asset_class AS "assetClass", volatility, verified FROM assets
        WHERE symbol ILIKE $1 OR name ILIKE $1 ORDER BY verified DESC, symbol LIMIT 20`, [like]);
    return { assets: rows };
  });

  // Refresh prices for symbols the user holds, using the configured market-data provider.
  app.post('/prices/refresh', { preHandler: app.requireAuth, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req) => {
    if (!config.ALPHA_VANTAGE_KEY) throw new HttpError(501, 'Live market data is not configured on this server.', 'no_provider');
    const held = (await pool.query(
      `SELECT DISTINCT a.symbol, a.asset_class FROM transactions t JOIN assets a ON a.symbol = t.symbol
        WHERE t.user_id = $1 AND a.symbol NOT LIKE 'DEMO\\_%' LIMIT 5`, [req.user.id])).rows;
    const results = [];
    for (const a of held) {
      try {
        const closes = await fetchDailyCloses(config, a.symbol, a.asset_class);
        await pool.query(
          `INSERT INTO price_history (symbol, day, close, source)
             SELECT $1, d, c, 'alphavantage' FROM unnest($2::date[], $3::numeric[]) AS t(d, c)
           ON CONFLICT (symbol, day) DO UPDATE SET close = EXCLUDED.close, source = EXCLUDED.source`,
          [a.symbol, closes.map(c => c.day), closes.map(c => c.close)]);
        results.push({ symbol: a.symbol, ok: true, points: closes.length });
      } catch (e) { results.push({ symbol: a.symbol, ok: false, error: e.message }); }
    }
    return { results };
  });

  app.post('/demo', auth, async (req, reply) => {
    const n = (await pool.query('SELECT count(*)::int AS n FROM transactions WHERE user_id = $1', [req.user.id])).rows[0].n;
    if (n > 0) throw new HttpError(409, 'Demo data can only be loaded into an empty portfolio', 'not_empty');
    const today = todayStr();
    const client = await pool.connect();
    let count;
    try {
      await client.query('BEGIN');
      count = await loadDemoPortfolio(client, req.user.id, today);
      await client.query('COMMIT');
    } catch (e) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } throw e; }
    finally { client.release(); }
    await audit(pool, req.user.id, 'demo_loaded', { count }, req.ip);
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
    return reply.status(201).send({ loaded: count, unlocked, note: 'Synthetic demo data — not real prices or trades.' });
  });
}
