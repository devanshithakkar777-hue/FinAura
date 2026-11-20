import { z } from 'zod';
import { SESSION_COOKIE } from '../app.js';
import { hashPassword, verifyPassword, newToken, sha256, DUMMY_HASH, HttpError } from '../lib/security.js';
import { todayStr } from '../lib/dates.js';
import { levelFromXP } from '../engines/gamify.js';
import { awardXp, checkIn } from '../services/gamify.js';

const CONSENT_VERSION = '2026-11';
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'Use at least 10 characters').max(128);

export const publicUser = u => ({
  id: u.id, email: u.email, name: u.name, handle: u.handle,
  riskProfile: u.risk_profile, currency: u.currency,
  xp: u.xp, ...(() => { const l = levelFromXP(u.xp); return { level: l.level, levelName: l.name }; })(),
  streakDays: u.streak_days, leaderboardOptIn: u.leaderboard_opt_in,
  emailVerified: Boolean(u.email_verified_at), onboarded: Boolean(u.risk_profile),
  createdAt: u.created_at,
});

export async function audit(db, userId, action, meta = {}, ip = null) {
  await db.query('INSERT INTO audit_log (user_id, action, meta, ip) VALUES ($1,$2,$3,$4)', [userId, action, meta, ip]);
}

/** Quiz scoring: 4 questions × 1–4 points. 4–7 Conservative, 8–12 Moderate, 13–16 Aggressive. */
export function profileFromScore(total) {
  return total <= 7 ? 'Conservative' : total <= 12 ? 'Moderate' : 'Aggressive';
}

export async function authRoutes(app) {
  const { pool, config } = app;
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  async function startSession(req, reply, userId) {
    const token = newToken();
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
       VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)`,
      [userId, sha256(token), (req.headers['user-agent'] ?? '').slice(0, 300), req.ip, String(config.SESSION_DAYS)]);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: config.SESSION_DAYS * 86400,
    });
  }

  async function sendVerification(user) {
    const token = newToken();
    await pool.query(`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at) VALUES ($1,'verify',$2, now() + interval '2 days')`, [user.id, sha256(token)]);
    await app.mailer.send({
      to: user.email, subject: 'Verify your FinAura email',
      text: `Welcome to FinAura, ${user.name}!\n\nVerify your email: ${config.PUBLIC_URL}/#/verify?token=${token}\n\nThis link expires in 2 days.`,
    });
  }

  app.post('/auth/register', authLimit, async (req, reply) => {
    const body = z.object({
      email, password, name: z.string().trim().min(1).max(60),
      acceptTerms: z.literal(true, { error: 'You must accept the Terms and Privacy Policy' }),
    }).parse(req.body);
    if (body.password.toLowerCase().includes(body.email.split('@')[0]) && body.email.split('@')[0].length >= 4) {
      throw new HttpError(400, 'Password must not contain your email name', 'weak_password');
    }
    const hash = await hashPassword(body.password);
    let user;
    try {
      user = (await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING *`, [body.email, hash, body.name])).rows[0];
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'An account with this email already exists', 'email_taken');
      throw e;
    }
    await pool.query('INSERT INTO consents (user_id, purpose, version, granted) VALUES ($1,$2,$3,true)', [user.id, 'terms_privacy', CONSENT_VERSION]);
    await audit(pool, user.id, 'register', {}, req.ip);
    await startSession(req, reply, user.id);
    sendVerification(user).catch(err => req.log.warn({ err: err.message }, 'verification email failed'));
    return reply.status(201).send({ user: publicUser(user) });
  });

  app.post('/auth/login', authLimit, async (req, reply) => {
    const body = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [body.email]);
    const user = rows[0];
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.', 'locked');
    }
    const ok = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        await pool.query(
          `UPDATE users SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END
           WHERE id = $1`, [user.id]);
        await audit(pool, user.id, 'login_failed', {}, req.ip);
      }
      throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
    }
    await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    await audit(pool, user.id, 'login', {}, req.ip);
    await startSession(req, reply, user.id);
    return { user: publicUser(user) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/auth/password-reset/request', authLimit, async (req) => {
    const { email: e } = z.object({ email }).parse(req.body);
    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE lower(email) = $1', [e]);
    if (rows[0]) {
      const token = newToken();
      await pool.query(`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at) VALUES ($1,'reset',$2, now() + interval '1 hour')`, [rows[0].id, sha256(token)]);
      await audit(pool, rows[0].id, 'password_reset_requested', {}, req.ip);
      app.mailer.send({
        to: rows[0].email, subject: 'Reset your FinAura password',
        text: `Reset your password: ${config.PUBLIC_URL}/#/reset?token=${token}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
      }).catch(err => req.log.warn({ err: err.message }, 'reset email failed'));
    }
    return { ok: true }; // identical response whether or not the account exists
  });

  app.post('/auth/password-reset/confirm', authLimit, async (req) => {
    const body = z.object({ token: z.string().min(10).max(200), password }).parse(req.body);
    const { rows } = await pool.query(
      `UPDATE email_tokens SET used_at = now()
        WHERE token_hash = $1 AND kind = 'reset' AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [sha256(body.token)]);
    if (!rows[0]) throw new HttpError(400, 'This reset link is invalid or has expired', 'bad_token');
    const hash = await hashPassword(body.password);
    await pool.query('UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [rows[0].user_id, hash]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].user_id]); // sign out everywhere
    await audit(pool, rows[0].user_id, 'password_reset_completed', {}, req.ip);
    return { ok: true };
  });

  app.post('/auth/verify', authLimit, async (req) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    const { rows } = await pool.query(
      `UPDATE email_tokens SET used_at = now()
        WHERE token_hash = $1 AND kind = 'verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [sha256(token)]);
    if (!rows[0]) throw new HttpError(400, 'This verification link is invalid or has expired', 'bad_token');
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [rows[0].user_id]);
    return { ok: true };
  });

  // ── Authenticated ────────────────────────────────────────────────────
  const auth = { preHandler: app.requireAuth };

  app.get('/me', auth, async (req) => {
    const today = todayStr();
    const ci = await checkIn(pool, req.user, today);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    return { user: publicUser(rows[0]), checkIn: ci };
  });

  app.post('/auth/resend-verification', { preHandler: app.requireAuth, ...authLimit }, async (req) => {
    if (req.user.email_verified_at) return { ok: true };
    await sendVerification(req.user);
    return { ok: true };
  });

  app.patch('/me', auth, async (req) => {
    const body = z.object({
      name: z.string().trim().min(1).max(60).optional(),
      currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
      riskProfile: z.enum(['Conservative', 'Moderate', 'Aggressive']).optional(),
      handle: z.string().regex(/^[a-z0-9_]{3,20}$/, '3–20 chars: lowercase letters, numbers, underscore').nullable().optional(),
      leaderboardOptIn: z.boolean().optional(),
    }).strict().parse(req.body);
    if (body.leaderboardOptIn && !(body.handle ?? req.user.handle)) throw new HttpError(400, 'Choose a public handle before joining the leaderboard', 'handle_required');
    const sets = [], vals = [req.user.id];
    const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (body.name !== undefined) add('name', body.name);
    if (body.currency !== undefined) add('currency', body.currency);
    if (body.riskProfile !== undefined) add('risk_profile', body.riskProfile);
    if (body.handle !== undefined) add('handle', body.handle);
    if (body.leaderboardOptIn !== undefined) {
      add('leaderboard_opt_in', body.leaderboardOptIn);
      await pool.query('INSERT INTO consents (user_id, purpose, version, granted) VALUES ($1,$2,$3,$4)', [req.user.id, 'leaderboard', CONSENT_VERSION, body.leaderboardOptIn]);
    }
    if (!sets.length) return { user: publicUser(req.user) };
    try {
      const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, vals);
      await audit(pool, req.user.id, 'profile_updated', { fields: Object.keys(body) }, req.ip);
      return { user: publicUser(rows[0]) };
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'That handle is taken', 'handle_taken');
      throw e;
    }
  });

  app.post('/me/onboarding', auth, async (req) => {
    const { answers } = z.object({ answers: z.array(z.number().int().min(1).max(4)).length(4) }).parse(req.body);
    const score = answers.reduce((a, b) => a + b, 0);
    const profile = profileFromScore(score);
    const { rows } = await pool.query('UPDATE users SET risk_profile = $2, quiz_score = $3, updated_at = now() WHERE id = $1 RETURNING *', [req.user.id, profile, score]);
    await awardXp(pool, req.user.id, 'onboarding', 'v1');
    return { user: publicUser((await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0] ?? rows[0]), score, profile };
  });

  app.post('/me/password', { preHandler: app.requireAuth, ...authLimit }, async (req) => {
    const body = z.object({ current: z.string().min(1).max(128), next: password }).parse(req.body);
    if (!(await verifyPassword(body.current, req.user.password_hash))) throw new HttpError(403, 'Current password is incorrect', 'bad_credentials');
    await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user.id, await hashPassword(body.next)]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [req.user.id, req.sessionId]);
    await audit(pool, req.user.id, 'password_changed', {}, req.ip);
    return { ok: true };
  });

  // DPDP: right of access / portability
  app.get('/me/export', auth, async (req, reply) => {
    const id = req.user.id;
    const q = async (sql) => (await pool.query(sql, [id])).rows;
    const data = {
      exportedAt: new Date().toISOString(),
      user: publicUser(req.user),
      transactions: await q('SELECT * FROM transactions WHERE user_id = $1 ORDER BY executed_on'),
      goals: await q('SELECT * FROM goals WHERE user_id = $1'),
      nudges: await q('SELECT * FROM nudges WHERE user_id = $1 ORDER BY created_at'),
      councilSessions: await q('SELECT * FROM council_sessions WHERE user_id = $1 ORDER BY created_at'),
      xpEvents: await q('SELECT kind, points, ref, created_at FROM xp_events WHERE user_id = $1'),
      achievements: await q('SELECT key, unlocked_at FROM achievements WHERE user_id = $1'),
      consents: await q('SELECT purpose, version, granted, created_at FROM consents WHERE user_id = $1 ORDER BY created_at'),
    };
    await audit(pool, id, 'data_export', {}, req.ip);
    reply.header('content-disposition', 'attachment; filename="finaura-data-export.json"');
    return data;
  });

  // DPDP: right to erasure
  app.delete('/me', auth, async (req, reply) => {
    const { password: pw } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    if (!(await verifyPassword(pw, req.user.password_hash))) throw new HttpError(403, 'Password is incorrect', 'bad_credentials');
    await audit(pool, req.user.id, 'account_deleted', { emailHash: sha256(req.user.email.toLowerCase()).slice(0, 16) }, req.ip);
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]); // cascades to all personal data
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me/consents', auth, async (req) => {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (purpose) purpose, version, granted, created_at FROM consents WHERE user_id = $1 ORDER BY purpose, created_at DESC`, [req.user.id]);
    return { consents: rows };
  });
}
