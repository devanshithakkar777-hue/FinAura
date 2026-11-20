import { XP_RULES, ACHIEVEMENTS, levelFromXP } from '../engines/gamify.js';
import { addDays, monthKey } from '../lib/dates.js';
import { tagTransactions } from '../engines/behavior.js';

/** Idempotent XP award. Returns points actually awarded (0 if already awarded). */
export async function awardXp(db, userId, kind, ref = '') {
  const rule = XP_RULES[kind];
  if (!rule) throw new Error(`Unknown XP kind ${kind}`);
  const ins = await db.query(
    `INSERT INTO xp_events (user_id, kind, points, ref) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, kind, ref) DO NOTHING RETURNING id`, [userId, kind, rule.points, ref]);
  if (!ins.rowCount) return 0;
  await db.query('UPDATE users SET xp = xp + $2, updated_at = now() WHERE id = $1', [userId, rule.points]);
  return rule.points;
}

/** Daily check-in: maintain streak and award a small XP bump once per day. */
export async function checkIn(db, user, today) {
  if (user.last_active_on === today) return { streakDays: user.streak_days, awarded: 0 };
  const streak = user.last_active_on === addDays(today, -1) ? user.streak_days + 1 : 1;
  await db.query('UPDATE users SET streak_days = $2, last_active_on = $3, updated_at = now() WHERE id = $1', [user.id, streak, today]);
  const awarded = await awardXp(db, user.id, 'daily_checkin', today);
  return { streakDays: streak, awarded };
}

export async function achievementContext(db, userId, pctx, today) {
  const q = async (sql, params = [userId]) => (await db.query(sql, params)).rows[0];
  const nudges = await q(`SELECT count(*) FILTER (WHERE decision <> 'pending')::int AS resolved,
                                 count(*) FILTER (WHERE decision IN ('waited','cancelled') AND risk_level = 'high')::int AS waited_high
                            FROM nudges WHERE user_id = $1`);
  const goals = await q('SELECT count(*)::int AS n FROM goals WHERE user_id = $1');
  const council = await q('SELECT count(*)::int AS n FROM council_sessions WHERE user_id = $1');
  const u = await q('SELECT streak_days FROM users WHERE id = $1');
  const buyMonths = new Set(pctx.txns.filter(t => t.side === 'buy').map(t => monthKey(t.executed_on)));
  const since = addDays(today, -90);
  const tagged = tagTransactions(pctx.txns, pctx.seriesBySymbol, pctx.assets, today);
  return {
    txnCount: pctx.txns.length,
    resolvedNudges: nudges.resolved, waitedHighRisk: nudges.waited_high,
    investMonths: buyMonths.size,
    classCount: pctx.allocation.length,
    goalCount: goals.n, councilCount: council.n, streakDays: u.streak_days,
    panicSells90: tagged.filter(t => t.tag === 'panic_sell' && t.day >= since).length,
  };
}

/** Unlock any newly-earned achievements. Returns the newly unlocked list. */
export async function evaluateAchievements(db, userId, pctx, today) {
  const ctx = await achievementContext(db, userId, pctx, today);
  const have = new Set((await db.query('SELECT key FROM achievements WHERE user_id = $1', [userId])).rows.map(r => r.key));
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.key) || !a.test(ctx)) continue;
    const r = await db.query('INSERT INTO achievements (user_id, key) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING key', [userId, a.key]);
    if (r.rowCount) unlocked.push({ key: a.key, title: a.title, desc: a.desc });
  }
  return unlocked;
}

export async function gamificationState(db, user, pctx, today) {
  const { level, name, prev, next } = levelFromXP(user.xp);
  const have = new Map((await db.query('SELECT key, unlocked_at FROM achievements WHERE user_id = $1', [user.id])).rows.map(r => [r.key, r.unlocked_at]));
  const ctx = await achievementContext(db, user.id, pctx, today);
  const recent = (await db.query('SELECT kind, points, created_at FROM xp_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [user.id])).rows
    .map(r => ({ ...r, label: XP_RULES[r.kind]?.label ?? r.kind }));
  return {
    xp: user.xp, level, levelName: name, prevThreshold: prev, nextThreshold: next, streakDays: user.streak_days,
    achievements: ACHIEVEMENTS.map(a => ({ key: a.key, title: a.title, desc: a.desc, unlocked: have.has(a.key), unlockedAt: have.get(a.key) ?? null, progress: a.test(ctx) })),
    recent,
  };
}
