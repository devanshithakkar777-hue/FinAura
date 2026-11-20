import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr, isValidDay, addDays, monthKey } from '../lib/dates.js';
import { seriesFor, latest } from '../lib/series.js';
import { loadPortfolioContext } from '../services/context.js';
import { analyzeBehavior } from '../engines/behavior.js';
import { runPremortem } from '../engines/premortem.js';
import { runCouncil, goalProjection, parseQuestion } from '../engines/council.js';
import { runTwin, habitsFromBehavior, hashSeed, SCENARIOS } from '../engines/twin.js';
import { awardXp, evaluateAchievements, gamificationState } from '../services/gamify.js';
import { synthesizeCouncil } from '../lib/llm.js';

export async function insightRoutes(app) {
  const { pool, config } = app;
  const auth = { preHandler: app.requireAuth };
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  const behaviorFor = ctx => analyzeBehavior({
    txns: ctx.txns, seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets,
    positionsInfo: { positions: ctx.positions, cryptoWeight: ctx.cryptoWeight, health: ctx.health },
    riskProfile: ctx.riskProfile, today: ctx.today, dataQuality: ctx.dataQuality,
  });

  /** Series for a symbol the user may not hold (for pre-mortem on a buy). */
  async function seriesForSymbol(ctx, symbol) {
    if (ctx.seriesBySymbol.has(symbol)) return { series: ctx.seriesBySymbol.get(symbol), quality: ctx.quality[symbol] };
    const rows = (await pool.query('SELECT day, close FROM price_history WHERE symbol = $1 ORDER BY day', [symbol])).rows;
    return seriesFor(rows, []);
  }

  app.get('/behavior', auth, async (req) => {
    const ctx = await loadPortfolioContext(pool, req.user, todayStr());
    return behaviorFor(ctx);
  });

  // ── Pre-mortem ───────────────────────────────────────────────────────
  app.post('/premortem', heavy, async (req) => {
    const body = z.object({
      symbol: z.string().trim().toUpperCase().min(1).max(20),
      side: z.enum(['buy', 'sell']),
      quantity: z.number().positive().max(1e12),
      price: z.number().positive().max(1e12).optional(),
    }).parse(req.body);
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const asset = (await pool.query('SELECT * FROM assets WHERE symbol = $1', [body.symbol])).rows[0];
    if (!asset) throw new HttpError(404, `Unknown symbol ${body.symbol}`, 'unknown_asset');
    const { series, quality } = await seriesForSymbol(ctx, body.symbol);
    if (!series.length) throw new HttpError(422, 'No price data for this symbol yet, so a pre-mortem cannot be run.', 'no_prices');
    const result = runPremortem({
      symbol: body.symbol, side: body.side, quantity: body.quantity, price: body.price, series, asset,
      txns: ctx.txns, seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets, positions: ctx.positions,
      riskProfile: ctx.riskProfile, today,
    });
    if (result.error) throw new HttpError(422, result.error, 'oversell');
    const price = result.context.price;
    const nudge = (await pool.query(
      `INSERT INTO nudges (user_id, symbol, side, quantity, price, risk_level, analysis)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
      [req.user.id, body.symbol, body.side, body.quantity, price, result.riskLevel, result])).rows[0];
    await awardXp(pool, req.user.id, 'premortem_done', nudge.id);
    return { id: nudge.id, symbol: body.symbol, side: body.side, quantity: body.quantity, dataQuality: quality, ...result };
  });

  app.post('/nudges/:id/resolve', auth, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { decision } = z.object({ decision: z.enum(['proceeded', 'waited', 'cancelled']) }).parse(req.body);
    const n = (await pool.query('SELECT * FROM nudges WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!n) throw new HttpError(404, 'Check not found', 'not_found');
    if (n.decision !== 'pending') throw new HttpError(409, 'Already resolved', 'already_resolved');
    const cooldown = decision === 'waited' && n.risk_level === 'high' ? `now() + interval '24 hours'` : 'NULL';
    await pool.query(`UPDATE nudges SET decision = $2, resolved_at = now(), cooldown_until = ${cooldown} WHERE id = $1`, [id, decision]);
    let xp = 0;
    if (decision !== 'proceeded' && n.risk_level !== 'low') xp = await awardXp(pool, req.user.id, 'premortem_waited', id);
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
    return { ok: true, xpAwarded: xp, unlocked };
  });

  app.get('/nudges', auth, async (req) => {
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const { rows } = await pool.query(
      `SELECT id, symbol, side, quantity, price, risk_level, decision, cooldown_until, created_at, resolved_at, analysis->>'headline' AS headline
         FROM nudges WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    let outcome = 0, heldBack = 0;
    const items = rows.map(r => {
      const now = latest(ctx.seriesBySymbol.get(r.symbol) ?? [])?.close ?? null;
      let result = null;
      // For a sell the user held back: positive = staying invested has gained since; negative = selling would have been better.
      if (r.side === 'sell' && r.decision !== 'proceeded' && r.decision !== 'pending' && now) {
        result = Math.round(r.quantity * (now - r.price));
        outcome += result; heldBack += 1;
      }
      return { ...r, outcomeSinceDecision: result };
    });
    return { nudges: items, summary: { heldBackSells: heldBack, netOutcome: Math.round(outcome) } };
  });

  // ── Council ──────────────────────────────────────────────────────────
  app.post('/council', heavy, async (req) => {
    const { question } = z.object({ question: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    if (!ctx.positions.length) throw new HttpError(422, 'Add some holdings (or load the demo portfolio) before consulting the council.', 'empty_portfolio');
    const behavior = behaviorFor(ctx);
    const goals = (await pool.query('SELECT * FROM goals WHERE user_id = $1', [req.user.id])).rows;
    const known = (await pool.query('SELECT symbol FROM assets')).rows.map(r => r.symbol);
    const topic = parseQuestion(question, ctx.positions, known);

    let premortem = null;
    if (topic.symbol && topic.action !== 'rebalance') {
      const asset = (await pool.query('SELECT * FROM assets WHERE symbol = $1', [topic.symbol])).rows[0];
      const pos = ctx.positions.find(p => p.symbol === topic.symbol);
      const { series } = await seriesForSymbol(ctx, topic.symbol);
      if (asset && series.length && (topic.action === 'buy' || pos)) {
        const px = latest(series).close;
        const r = runPremortem({
          symbol: topic.symbol, side: topic.action, quantity: topic.action === 'sell' ? pos.quantity * 0.5 : (ctx.totals.value * 0.05) / px,
          price: px, series, asset, txns: ctx.txns, seriesBySymbol: ctx.seriesBySymbol, assets: ctx.assets, positions: ctx.positions, riskProfile: ctx.riskProfile, today,
        });
        if (!r.error) premortem = r;
      }
    }
    const result = runCouncil({
      positions: ctx.positions, allocation: ctx.allocation, total: ctx.totals.value, health: ctx.health, rsi: ctx.rsi,
      riskProfile: ctx.riskProfile, behavior, premortem, goals, now: today, knownSymbols: known,
    }, question);
    const llm = await synthesizeCouncil(config, result, question, req.log);
    if (llm) result.moderator.summary = llm, result.moderator.llm = true;
    const row = (await pool.query('INSERT INTO council_sessions (user_id, question, result) VALUES ($1,$2,$3) RETURNING id, created_at', [req.user.id, question ?? null, result])).rows[0];
    await awardXp(pool, req.user.id, 'council_run', row.id);
    const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
    return { id: row.id, createdAt: row.created_at, question: question ?? null, unlocked, ...result };
  });

  app.get('/council', auth, async (req) => {
    const { rows } = await pool.query('SELECT id, question, result->\'moderator\' AS moderator, result->\'topic\' AS topic, created_at FROM council_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    return { sessions: rows };
  });

  // ── Digital twin ─────────────────────────────────────────────────────
  app.get('/twin', heavy, async (req) => {
    const q = z.object({
      scenario: z.enum(Object.keys(SCENARIOS)).default('crash'),
      years: z.coerce.number().int().min(3).max(25).default(10),
    }).parse(req.query);
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    if (!ctx.positions.length) throw new HttpError(422, 'Add some holdings (or load the demo portfolio) to build your twin.', 'empty_portfolio');
    const behavior = behaviorFor(ctx);
    const weights = Object.fromEntries(ctx.allocation.map(a => [a.assetClass, a.weight]));
    const since = addDays(today, -180);
    const recentBuys = ctx.txns.filter(t => t.side === 'buy' && t.executed_on >= since);
    const months = new Set(recentBuys.map(t => monthKey(t.executed_on)));
    const monthlyBuy = recentBuys.reduce((s, t) => s + t.quantity * t.price, 0) / Math.max(1, Math.min(6, months.size || 1));
    const goalSum = (await pool.query('SELECT COALESCE(sum(monthly_contribution),0) AS s FROM goals WHERE user_id = $1', [req.user.id])).rows[0].s;
    const monthlyContribution = Math.round(goalSum > 0 ? goalSum : monthlyBuy);
    const habits = habitsFromBehavior(behavior);
    const result = runTwin(weights, habits, {
      startValue: ctx.totals.value, monthlyContribution, years: q.years, scenario: q.scenario, paths: 300, seed: hashSeed(req.user.id),
    });
    return { ...result, scenarios: Object.entries(SCENARIOS).map(([key, v]) => ({ key, label: v.label })), weights };
  });

  // ── Goals ────────────────────────────────────────────────────────────
  const goalFields = z.object({
    name: z.string().trim().min(1).max(60),
    targetAmount: z.number().positive().max(1e12),
    targetDate: z.string().refine(isValidDay, 'Use YYYY-MM-DD'),
    monthlyContribution: z.number().min(0).max(1e12),
  });
  const goalCreate = goalFields.extend({ monthlyContribution: goalFields.shape.monthlyContribution.default(0) });
  const goalPatch = goalFields.partial().strict();

  app.get('/goals', auth, async (req) => {
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const rows = (await pool.query('SELECT * FROM goals WHERE user_id = $1 ORDER BY target_date', [req.user.id])).rows;
    const share = rows.length ? ctx.totals.value / rows.length : 0; // portfolio value is split evenly across goals (simple, transparent)
    return {
      goals: rows.map(g => {
        const p = goalProjection(g, share, ctx.riskProfile, today);
        return {
          id: g.id, name: g.name, targetAmount: g.target_amount, targetDate: g.target_date, monthlyContribution: g.monthly_contribution,
          projected: Math.round(p.projected), onTrackRatio: p.ratio, assumedReturn: p.assumedReturn, allocatedValue: Math.round(share),
          status: p.ratio >= 1 ? 'on_track' : p.ratio >= 0.9 ? 'close' : 'behind',
        };
      }),
      note: 'Projections are illustrative, assume a fixed annual return for your risk profile, and split your portfolio evenly across goals.',
    };
  });

  app.post('/goals', auth, async (req, reply) => {
    const b = goalCreate.parse(req.body);
    if (b.targetDate <= todayStr()) throw new HttpError(422, 'Target date must be in the future', 'past_date');
    const n = (await pool.query('SELECT count(*)::int AS n FROM goals WHERE user_id = $1', [req.user.id])).rows[0].n;
    if (n >= 20) throw new HttpError(422, 'Goal limit reached', 'goal_limit');
    const g = (await pool.query(
      'INSERT INTO goals (user_id, name, target_amount, target_date, monthly_contribution) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.user.id, b.name, b.targetAmount, b.targetDate, b.monthlyContribution])).rows[0];
    const xp = await awardXp(pool, req.user.id, 'goal_created', g.id);
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const unlocked = await evaluateAchievements(pool, req.user.id, ctx, today);
    return reply.status(201).send({ id: g.id, xpAwarded: xp, unlocked });
  });

  app.patch('/goals/:id', auth, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = goalPatch.parse(req.body);
    const cur = (await pool.query('SELECT * FROM goals WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!cur) throw new HttpError(404, 'Goal not found', 'not_found');
    await pool.query(
      'UPDATE goals SET name = $3, target_amount = $4, target_date = $5, monthly_contribution = $6 WHERE id = $1 AND user_id = $2',
      [id, req.user.id, b.name ?? cur.name, b.targetAmount ?? cur.target_amount, b.targetDate ?? cur.target_date, b.monthlyContribution ?? cur.monthly_contribution]);
    return { ok: true };
  });

  app.delete('/goals/:id', auth, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Goal not found', 'not_found');
    return { ok: true };
  });

  // ── Gamification ─────────────────────────────────────────────────────
  app.get('/gamification', auth, async (req) => {
    const today = todayStr();
    const ctx = await loadPortfolioContext(pool, req.user, today);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    return gamificationState(pool, rows[0], ctx, today);
  });

  app.get('/leaderboard', auth, async (req) => {
    const top = (await pool.query(
      `SELECT handle, xp, row_number() OVER (ORDER BY xp DESC, created_at) AS rank
         FROM users WHERE leaderboard_opt_in AND handle IS NOT NULL ORDER BY xp DESC, created_at LIMIT 20`)).rows;
    let me = null;
    if (req.user.leaderboard_opt_in) {
      me = (await pool.query(
        `SELECT rank FROM (SELECT id, row_number() OVER (ORDER BY xp DESC, created_at) AS rank FROM users WHERE leaderboard_opt_in) t WHERE id = $1`, [req.user.id])).rows[0]?.rank ?? null;
    }
    return { leaders: top.map(t => ({ ...t, isYou: t.handle === req.user.handle })), you: me, optedIn: req.user.leaderboard_opt_in };
  });
}
