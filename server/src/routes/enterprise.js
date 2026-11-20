import { z } from 'zod';
import crypto from 'node:crypto';
import { HttpError } from '../lib/security.js';
import { todayStr } from '../lib/dates.js';
import { analyze, behaviourOf } from '../services/analysis.js';
import { stressTest } from '../engines/stress.js';
import { wellnessScore } from '../engines/ecosystem.js';
import { wealthProjection } from '../engines/planning.js';
import { compareRegimes } from '../engines/tax.js';

export const SCOPES = ['netWorth', 'wellness', 'behaviour', 'plan', 'allocation'];
const scopeSchema = z.object(Object.fromEntries(SCOPES.map(k => [k, z.boolean().default(false)])));
const hash = k => crypto.createHash('sha256').update(k).digest('hex');
const emailOf = u => String(u.email).toLowerCase();

export async function enterpriseRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const idParam = z.object({ id: z.string().uuid() });
  const orgOf = async uid => (await pool.query('SELECT * FROM organizations WHERE owner_id = $1', [uid])).rows[0] ?? null;
  const needOrg = async uid => { const o = await orgOf(uid); if (!o) throw new HttpError(403, 'Create an advisor workspace first', 'forbidden'); return o; };
  const orgView = o => ({ id: o.id, name: o.name, brandName: o.brand_name, primaryColor: o.primary_color, disclaimer: o.disclaimer, registrationNote: o.registration_note });
  const brand = z.object({ name: z.string().trim().min(1).max(80), brandName: z.string().trim().max(60).nullable().optional(), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), disclaimer: z.string().trim().max(600).nullable().optional(), registrationNote: z.string().trim().max(200).nullable().optional() });

  // ── Workspace + white-label ────────────────────────────────────
  app.post('/org', auth, async (req, reply) => {
    const b = brand.parse(req.body);
    if (await orgOf(req.user.id)) throw new HttpError(409, 'You already have a workspace', 'conflict');
    const o = (await pool.query('INSERT INTO organizations (owner_id, name, brand_name, primary_color, disclaimer, registration_note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.user.id, b.name, b.brandName ?? null, b.primaryColor ?? null, b.disclaimer ?? null, b.registrationNote ?? null])).rows[0];
    reply.code(201); return { org: orgView(o), note: 'FinAura is an analysis tool. If you give regulated advice to clients, you must hold the registration your jurisdiction requires and remain responsible for that advice.' };
  });
  app.get('/org', auth, async (req) => { const o = await orgOf(req.user.id); return { org: o ? orgView(o) : null }; });
  app.put('/org', auth, async (req) => {
    const b = brand.parse(req.body), o = await needOrg(req.user.id);
    const r = (await pool.query('UPDATE organizations SET name=$2, brand_name=$3, primary_color=$4, disclaimer=$5, registration_note=$6 WHERE id=$1 RETURNING *', [o.id, b.name, b.brandName ?? null, b.primaryColor ?? null, b.disclaimer ?? null, b.registrationNote ?? null])).rows[0];
    return { org: orgView(r) };
  });
  app.get('/branding/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const o = (await pool.query('SELECT brand_name, name, primary_color, disclaimer FROM organizations WHERE id = $1', [id])).rows[0];
    if (!o) throw new HttpError(404, 'Not found', 'not_found');
    return { brandName: o.brand_name ?? o.name, primaryColor: o.primary_color, disclaimer: o.disclaimer };
  });

  // ── Clients, with the client in control ────────────────────────
  app.post('/org/clients/invite', auth, async (req, reply) => {
    const b = z.object({ email: z.string().trim().toLowerCase().email().max(200), scope: scopeSchema }).parse(req.body), o = await needOrg(req.user.id);
    if (b.email === emailOf(req.user)) throw new HttpError(400, 'You cannot invite yourself', 'bad_request');
    if (!SCOPES.some(k => b.scope[k])) throw new HttpError(400, 'Request at least one data scope', 'validation');
    const ex = (await pool.query('SELECT id, status FROM client_links WHERE org_id = $1 AND client_email = $2', [o.id, b.email])).rows[0];
    if (ex && ex.status !== 'revoked') throw new HttpError(409, 'Already invited or linked', 'conflict');
    const r = ex
      ? (await pool.query(`UPDATE client_links SET status='invited', requested_scope=$2, scope='{}', consented_at=NULL, revoked_at=NULL WHERE id=$1 RETURNING id`, [ex.id, b.scope])).rows[0]
      : (await pool.query('INSERT INTO client_links (org_id, client_email, requested_scope) VALUES ($1,$2,$3) RETURNING id', [o.id, b.email, b.scope])).rows[0];
    reply.code(201); return { id: r.id, note: 'The client sees nothing shared until they accept, and they decide which scopes to grant.' };
  });
  app.get('/org/clients', auth, async (req) => {
    const o = await needOrg(req.user.id);
    return { clients: (await pool.query(`SELECT l.id, l.client_email AS email, l.status, l.scope, l.requested_scope AS "requestedScope", l.consented_at AS "consentedAt", u.name FROM client_links l LEFT JOIN users u ON u.id = l.client_user_id WHERE l.org_id = $1 ORDER BY l.created_at`, [o.id])).rows };
  });
  app.delete('/org/clients/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params), o = await needOrg(req.user.id);
    const r = await pool.query(`UPDATE client_links SET status='revoked', scope='{}', revoked_at=now() WHERE id=$1 AND org_id=$2 AND status <> 'revoked'`, [id, o.id]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found'); return { ok: true };
  });

  const clientCard = async (link, today) => {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [link.client_user_id])).rows[0], sc = link.scope ?? {};
    const a = await analyze(pool, user, today), out = { linkId: link.id, name: user.name, email: link.client_email, scope: sc };
    const seen = [];
    if (sc.netWorth) { out.netWorth = Math.round(a.s.nw.netWorth); seen.push('netWorth'); }
    if (sc.wellness) { out.wellness = a.wellness.ready ? { score: a.wellness.score, band: a.wellness.band, weakest: a.wellness.weakest, components: a.wellness.components } : null; seen.push('wellness'); }
    if (sc.behaviour) { const b = behaviourOf(a.s.ctx, today); out.behaviour = b.status === 'insufficient_data' ? null : { score: b.score ?? b.overall ?? null, flags: (b.patterns ?? []).filter(p => p.severity !== 'good').map(p => p.label) }; seen.push('behaviour'); }
    if (sc.plan) { out.plan = a.retirement.ready ? { retirementReadiness: Math.round(a.retirement.readiness * 100) / 100 } : null; seen.push('plan'); }
    if (sc.allocation) { out.allocation = a.s.nw.allocation.map(x => ({ group: x.group, weight: Math.round(x.weight * 100) / 100 })); seen.push('allocation'); }
    await pool.query('INSERT INTO advisor_access_log (link_id, what) VALUES ($1,$2)', [link.id, seen.join(',') || 'none']);
    return out;
  };
  app.get('/org/dashboard', { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const o = await needOrg(req.user.id), today = todayStr();
    const links = (await pool.query(`SELECT * FROM client_links WHERE org_id = $1 AND status = 'active'`, [o.id])).rows, clients = [];
    for (const l of links) clients.push(await clientCard(l, today));
    const w = clients.map(c => c.wellness?.score).filter(x => x != null);
    return { clients, aggregate: { activeClients: clients.length, withWellness: w.length, averageWellness: w.length ? Math.round(w.reduce((s, x) => s + x, 0) / w.length) : null, needingAttention: clients.filter(c => c.wellness && c.wellness.score < 50).map(c => c.name), note: 'Aggregates use only the data each client chose to share.' } };
  });

  // client side
  const myLinks = async user => (await pool.query(`SELECT l.id, l.status, l.scope, l.requested_scope AS "requestedScope", o.name AS "orgName", COALESCE(o.brand_name, o.name) AS "brandName", o.disclaimer, o.registration_note AS "registrationNote" FROM client_links l JOIN organizations o ON o.id = l.org_id WHERE (lower(l.client_email) = $1 OR l.client_user_id = $2) AND l.status <> 'revoked' ORDER BY l.created_at DESC`, [emailOf(user), user.id])).rows;
  app.get('/me/advisors', auth, async (req) => ({ advisors: await myLinks(req.user) }));
  app.post('/me/advisors/:id/accept', auth, async (req) => {
    const { id } = idParam.parse(req.params), b = z.object({ scope: scopeSchema }).parse(req.body);
    const l = (await pool.query(`SELECT requested_scope FROM client_links WHERE id = $1 AND lower(client_email) = $2 AND status = 'invited'`, [id, emailOf(req.user)])).rows[0];
    if (!l) throw new HttpError(404, 'Invitation not found', 'not_found');
    const granted = Object.fromEntries(SCOPES.map(k => [k, !!(b.scope[k] && l.requested_scope[k])]));
    if (!SCOPES.some(k => granted[k])) throw new HttpError(400, 'Grant at least one of the requested scopes, or decline the invitation', 'validation');
    await pool.query(`UPDATE client_links SET status='active', client_user_id=$2, scope=$3, consented_at=now() WHERE id=$1`, [id, req.user.id, granted]);
    return { scope: granted };
  });
  app.post('/me/advisors/:id/decline', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    await pool.query(`UPDATE client_links SET status='revoked', scope='{}', revoked_at=now() WHERE id=$1 AND lower(client_email)=$2 AND status='invited'`, [id, emailOf(req.user)]); return { ok: true };
  });
  app.post('/me/advisors/:id/revoke', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const r = await pool.query(`UPDATE client_links SET status='revoked', scope='{}', revoked_at=now() WHERE id=$1 AND client_user_id=$2 AND status='active'`, [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found'); return { ok: true };
  });
  app.put('/me/advisors/:id/scope', auth, async (req) => {
    const { id } = idParam.parse(req.params), b = z.object({ scope: scopeSchema }).parse(req.body);
    const l = (await pool.query(`SELECT requested_scope FROM client_links WHERE id=$1 AND client_user_id=$2 AND status='active'`, [id, req.user.id])).rows[0];
    if (!l) throw new HttpError(404, 'Not found', 'not_found');
    const granted = Object.fromEntries(SCOPES.map(k => [k, !!(b.scope[k] && l.requested_scope[k])]));
    await pool.query('UPDATE client_links SET scope = $2 WHERE id = $1', [id, granted]); return { scope: granted };
  });
  app.get('/me/advisors/:id/access-log', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query('SELECT 1 FROM client_links WHERE id=$1 AND client_user_id=$2', [id, req.user.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { log: (await pool.query('SELECT what, at FROM advisor_access_log WHERE link_id = $1 ORDER BY id DESC LIMIT 100', [id])).rows };
  });

  // ── API keys ───────────────────────────────────────────────────
  app.post('/org/api-keys', auth, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body), o = await needOrg(req.user.id);
    if ((await pool.query('SELECT count(*)::int AS n FROM api_keys WHERE org_id = $1 AND revoked_at IS NULL', [o.id])).rows[0].n >= 5) throw new HttpError(400, 'Up to 5 active keys', 'limit');
    const key = `fa_live_${crypto.randomBytes(24).toString('hex')}`;
    const r = (await pool.query('INSERT INTO api_keys (org_id, name, prefix, key_hash) VALUES ($1,$2,$3,$4) RETURNING id', [o.id, name, key.slice(0, 12), hash(key)])).rows[0];
    reply.code(201); return { id: r.id, key, note: 'Copy this now. It is shown once and we store only a hash.' };
  });
  app.get('/org/api-keys', auth, async (req) => { const o = await needOrg(req.user.id); return { keys: (await pool.query('SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE org_id = $1 ORDER BY created_at DESC', [o.id])).rows }; });
  app.delete('/org/api-keys/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params), o = await needOrg(req.user.id);
    const r = await pool.query('UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL', [id, o.id]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found'); return { ok: true };
  });
}

/** Stateless, key-authenticated analysis API. No user data is stored or read. */
export async function publicApiRoutes(app) {
  const { pool } = app;
  const limit = { rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: req => String(req.headers['x-api-key'] ?? req.ip) } };
  const keyAuth = async (req) => {
    const k = req.headers['x-api-key'];
    if (typeof k !== 'string' || k.length < 20) throw new HttpError(401, 'Missing or invalid API key', 'unauthorized');
    const r = (await pool.query(`UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING org_id`, [hash(k)])).rows[0];
    if (!r) throw new HttpError(401, 'Missing or invalid API key', 'unauthorized');
    req.orgId = r.org_id;
  };
  const route = { preHandler: keyAuth, config: limit };
  const money = z.number().min(0).max(1e13);
  const meta = { disclaimer: 'Educational analysis based only on the inputs you send. Not investment, tax or legal advice.' };

  app.get('/v1/me', route, async (req) => ({ data: { orgId: req.orgId }, meta }));
  app.post('/v1/stress', route, async (req) => {
    const b = z.object({ allocation: z.partialRecord(z.enum(['equity', 'mutualFund', 'crypto', 'bond', 'gold', 'cash', 'realEstate']), money), totalDebt: money.default(0), monthlyEmi: money.default(0), monthlyExpenses: money.default(0), annualIncome: money.default(0), shocks: z.partialRecord(z.enum(['equity', 'mutualFund', 'crypto', 'bond', 'gold', 'cash', 'realEstate']), z.number().min(-1).max(1)).optional() }).parse(req.body);
    const total = Object.values(b.allocation).reduce((s, v) => s + v, 0), alloc = Object.entries(b.allocation).map(([group, value]) => ({ group, value, weight: total ? value / total : 0 }));
    const nw = { allocation: alloc, totalAssets: total, totalDebt: b.totalDebt, monthlyEmi: b.monthlyEmi, netWorth: total - b.totalDebt };
    return { data: stressTest(nw, { annualIncome: b.annualIncome, monthlyExpenses: b.monthlyExpenses }, undefined, b.shocks ?? null), meta };
  });
  app.post('/v1/wellness', route, async (req) => {
    const b = z.object({ annualIncome: money.optional(), monthlyExpenses: money.optional(), monthlyEmi: money.default(0), totalAssets: money.default(0), liquidAssets: money.default(0), diversification: z.number().min(0).max(100).optional() }).parse(req.body);
    const target = b.monthlyExpenses ? 6 : null;
    const emergency = target ? { ready: true, targetMonths: target, coverageMonths: b.liquidAssets / Math.max(1, b.monthlyExpenses + b.monthlyEmi) } : null;
    return { data: wellnessScore({ profile: { annualIncome: b.annualIncome, monthlyExpenses: b.monthlyExpenses }, nw: { monthlyEmi: b.monthlyEmi, totalAssets: b.totalAssets }, emergency, insurance: null, diversification: b.diversification ?? null, retirement: null }), meta };
  });
  app.post('/v1/projection', route, async (req) => {
    const b = z.object({ start: money, monthly: money, years: z.number().int().min(1).max(60), rate: z.number().min(0).max(0.4), stepUp: z.number().min(0).max(0.3).default(0) }).parse(req.body);
    return { data: wealthProjection(b), meta };
  });
  app.post('/v1/tax/regimes', route, async (req) => {
    const b = z.object({ grossIncome: z.number().min(0).max(1e11) }).catchall(z.number().min(0).max(1e11)).parse(req.body);
    return { data: compareRegimes(b), meta };
  });
}
