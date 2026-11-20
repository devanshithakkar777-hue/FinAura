import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr } from '../lib/dates.js';
import { analyze, behaviourOf } from '../services/analysis.js';
import { CATEGORIES, CAPACITIES, CONSULT_KINDS, publicCapacities, trustScore, classifyNeed, matchExperts, inAvailability, buildBrief } from '../engines/connect.js';

const SCOPES = ['profile', 'netWorth', 'wellness', 'behaviour', 'plan', 'allocation', 'documents'];
const scopeSchema = z.object(Object.fromEntries(SCOPES.map(k => [k, z.boolean().default(false)])));
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParam = z.object({ id: z.string().uuid() });
const cat = z.enum(Object.keys(CATEGORIES)), capacity = z.enum(Object.keys(CAPACITIES));
const slot = z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) });
const profileBody = z.object({
  displayName: z.string().trim().min(1).max(80), headline: z.string().trim().min(1).max(140), bio: z.string().trim().min(20).max(1500), category: cat, capacity,
  specialties: z.array(z.string().trim().min(1).max(40)).max(10).default([]), languages: z.array(z.string().trim().min(1).max(30)).min(1).max(8), credentials: z.string().trim().min(5).max(600),
  registrationBody: z.string().trim().max(80).nullable().optional(), registrationNumber: z.string().trim().max(60).nullable().optional(), yearsExperience: z.number().int().min(0).max(60).default(0),
  fee: z.number().min(0).max(1e7), feeModel: z.enum(['per_session', 'hourly', 'free_first']).default('per_session'),
  feeDisclosure: z.string().trim().min(10).max(500), conflictsDisclosure: z.string().trim().min(10).max(500), availability: z.array(slot).max(30).default([]), acceptsNri: z.boolean().default(false),
});

export async function connectRoutes(app) {
  const { pool, config } = app;
  const auth = { preHandler: app.requireAuth };
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const isAdmin = u => config.ADMIN_EMAILS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(String(u.email).toLowerCase());
  const needAdmin = async req => { if (!isAdmin(req.user)) throw new HttpError(403, 'Admin only', 'forbidden'); };
  const audit = (uid, role, action, target, meta) => pool.query('INSERT INTO connect_audit (actor_user_id, role, action, target, meta) VALUES ($1,$2,$3,$4,$5)', [uid, role, action, target ?? null, meta ?? null]);
  const myExpert = async uid => (await pool.query('SELECT * FROM experts WHERE user_id = $1', [uid])).rows[0] ?? null;
  const needExpert = async (uid, verified = true) => { const e = await myExpert(uid); if (!e) throw new HttpError(403, 'You do not have an expert profile', 'forbidden'); if (verified && e.status !== 'verified') throw new HttpError(403, 'Your profile is not verified', 'forbidden'); return e; };

  const trustOf = async e => {
    const [rv, cp, done] = await Promise.all([
      pool.query('SELECT rating FROM expert_reviews WHERE expert_id = $1', [e.id]),
      pool.query(`SELECT status FROM complaints WHERE expert_id = $1`, [e.id]),
      pool.query(`SELECT count(*)::int AS n FROM consultations WHERE expert_id = $1 AND status = 'completed'`, [e.id]),
    ]);
    return trustScore({ verified: e.status === 'verified', ratings: rv.rows.map(r => r.rating), openComplaints: cp.rows.filter(c => c.status === 'open').length, upheldComplaints: cp.rows.filter(c => c.status === 'upheld').length, completed: done.rows[0].n, hasDisclosures: !!(e.fee_disclosure && e.conflicts_disclosure) });
  };
  const pub = (e, trust) => ({ id: e.id, name: e.display_name, headline: e.headline, bio: e.bio, category: e.category, capacity: e.capacity, capacityInfo: CAPACITIES[e.capacity] ? { label: CAPACITIES[e.capacity].label, regulated: CAPACITIES[e.capacity].regulated, personalInvestmentAdvice: CAPACITIES[e.capacity].personalAdvice, can: CAPACITIES[e.capacity].can, cannot: CAPACITIES[e.capacity].cannot } : null, specialties: e.specialties, languages: e.languages, credentials: e.credentials, registration: e.registration_body ? `${e.registration_body}${e.registration_number ? ` · ${e.registration_number}` : ''}` : null, yearsExperience: e.years_experience, fee: e.fee, feeModel: e.fee_model, feeDisclosure: e.fee_disclosure, conflictsDisclosure: e.conflicts_disclosure, availability: e.availability, acceptsNri: e.accepts_nri, trust: trust ? { score: trust.score, tier: trust.tier, averageRating: trust.averageRating, ratingCount: trust.ratingCount } : null });

  app.get('/connect/meta', auth, async () => ({ categories: CATEGORIES, capacities: publicCapacities(), kinds: CONSULT_KINDS, notice: 'FinAura Connect lists professionals who are verified by document review. FinAura is not a party to your arrangement with an expert and does not guarantee advice. Always check the expert’s registration on the regulator’s official register.', payments: 'Payments are not processed in this version. Fees are shown for information and settled directly with the expert.' }));

  // ── Expert onboarding & admin verification ─────────────────────
  app.post('/connect/expert/apply', auth, async (req, reply) => {
    const b = profileBody.parse(req.body);
    if (await myExpert(req.user.id)) throw new HttpError(409, 'You already have an expert profile', 'conflict');
    if (CAPACITIES[b.capacity].regulated && !(b.registrationBody && b.registrationNumber)) throw new HttpError(400, `${CAPACITIES[b.capacity].label} is a regulated capacity. Provide your registration body and number.`, 'validation');
    const r = (await pool.query(`INSERT INTO experts (user_id, display_name, headline, bio, category, capacity, specialties, languages, credentials, registration_body, registration_number, years_experience, fee, fee_model, fee_disclosure, conflicts_disclosure, availability, accepts_nri) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, [req.user.id, b.displayName, b.headline, b.bio, b.category, b.capacity, b.specialties, b.languages, b.credentials, b.registrationBody ?? null, b.registrationNumber ?? null, b.yearsExperience, b.fee, b.feeModel, b.feeDisclosure, b.conflictsDisclosure, JSON.stringify(b.availability), b.acceptsNri])).rows[0];
    await audit(req.user.id, 'expert', 'apply', r.id);
    reply.code(201); return { id: r.id, status: 'pending', note: 'Your profile is hidden until FinAura reviews your credentials.' };
  });
  app.get('/connect/expert/me', auth, async (req) => { const e = await myExpert(req.user.id); return { expert: e ? { ...pub(e, await trustOf(e)), status: e.status, statusReason: e.status_reason } : null }; });
  app.put('/connect/expert/me', auth, async (req) => {
    const b = profileBody.parse(req.body), e = await needExpert(req.user.id, false);
    if (CAPACITIES[b.capacity].regulated && !(b.registrationBody && b.registrationNumber)) throw new HttpError(400, 'Regulated capacities need a registration body and number', 'validation');
    // changing anything that was verified sends the profile back for review
    const sensitive = e.capacity !== b.capacity || e.category !== b.category || e.credentials !== b.credentials || (e.registration_number ?? null) !== (b.registrationNumber ?? null) || e.fee_disclosure !== b.feeDisclosure || e.conflicts_disclosure !== b.conflictsDisclosure;
    const status = e.status === 'verified' && sensitive ? 'pending' : e.status === 'rejected' ? 'pending' : e.status;
    await pool.query(`UPDATE experts SET display_name=$2, headline=$3, bio=$4, category=$5, capacity=$6, specialties=$7, languages=$8, credentials=$9, registration_body=$10, registration_number=$11, years_experience=$12, fee=$13, fee_model=$14, fee_disclosure=$15, conflicts_disclosure=$16, availability=$17, accepts_nri=$18, status=$19 WHERE id=$1`, [e.id, b.displayName, b.headline, b.bio, b.category, b.capacity, b.specialties, b.languages, b.credentials, b.registrationBody ?? null, b.registrationNumber ?? null, b.yearsExperience, b.fee, b.feeModel, b.feeDisclosure, b.conflictsDisclosure, JSON.stringify(b.availability), b.acceptsNri, status]);
    await audit(req.user.id, 'expert', 'update_profile', e.id, { backToReview: status !== e.status });
    return { status, note: status !== e.status ? 'Changes to credentials, capacity or disclosures need re-verification, so your profile is hidden until reviewed.' : undefined };
  });
  app.get('/connect/admin/experts', auth, async (req) => {
    await needAdmin(req);
    const { status } = z.object({ status: z.enum(['pending', 'verified', 'rejected', 'suspended']).default('pending') }).parse(req.query);
    return { experts: (await pool.query(`SELECT e.*, u.email FROM experts e JOIN users u ON u.id = e.user_id WHERE e.status = $1 ORDER BY e.created_at`, [status])).rows.map(e => ({ ...pub(e, null), email: e.email, status: e.status })) };
  });
  app.post('/connect/admin/experts/:id/decision', auth, async (req) => {
    await needAdmin(req);
    const { id } = idParam.parse(req.params), b = z.object({ decision: z.enum(['verify', 'reject', 'suspend', 'reinstate']), reason: z.string().trim().max(500).optional() }).parse(req.body);
    if ((b.decision === 'reject' || b.decision === 'suspend') && !b.reason) throw new HttpError(400, 'A reason is required', 'validation');
    const status = { verify: 'verified', reject: 'rejected', suspend: 'suspended', reinstate: 'verified' }[b.decision];
    const r = await pool.query(`UPDATE experts SET status=$2, status_reason=$3, verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END WHERE id=$1 RETURNING id`, [id, status, b.reason ?? null]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found');
    if (status === 'suspended') await pool.query(`UPDATE consultations SET status='cancelled' WHERE expert_id=$1 AND status IN ('requested','confirmed')`, [id]);
    await audit(req.user.id, 'admin', b.decision, id, { reason: b.reason });
    return { status };
  });
  app.get('/connect/admin/complaints', auth, async (req) => { await needAdmin(req); return { complaints: (await pool.query(`SELECT c.*, e.display_name AS expert FROM complaints c JOIN experts e ON e.id = c.expert_id WHERE c.status = 'open' ORDER BY c.created_at`)).rows }; });
  app.post('/connect/admin/complaints/:id/resolve', auth, async (req) => {
    await needAdmin(req);
    const { id } = idParam.parse(req.params), b = z.object({ outcome: z.enum(['upheld', 'dismissed']), resolution: z.string().trim().min(5).max(500) }).parse(req.body);
    const r = await pool.query(`UPDATE complaints SET status=$2, resolution=$3, resolved_at=now() WHERE id=$1 AND status='open' RETURNING id`, [id, b.outcome, b.resolution]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found');
    await audit(req.user.id, 'admin', `complaint_${b.outcome}`, id); return { ok: true };
  });
  app.get('/connect/admin/audit', auth, async (req) => { await needAdmin(req); return { log: (await pool.query('SELECT id, actor_user_id, role, action, target, meta, at FROM connect_audit ORDER BY id DESC LIMIT 200')).rows }; });

  // ── Discovery and AI matching ──────────────────────────────────
  const verifiedExperts = async () => {
    const rows = (await pool.query(`SELECT * FROM experts WHERE status = 'verified'`)).rows;
    return Promise.all(rows.map(async e => ({ ...e, trust: await trustOf(e) })));
  };
  app.get('/connect/experts', auth, async (req) => {
    const q = z.object({ category: cat.optional(), language: z.string().max(30).optional(), maxFee: z.coerce.number().min(0).optional(), nri: z.enum(['true']).optional(), q: z.string().max(80).optional() }).parse(req.query);
    let list = await verifiedExperts();
    if (q.category) list = list.filter(e => e.category === q.category);
    if (q.language) list = list.filter(e => e.languages.map(l => l.toLowerCase()).includes(q.language.toLowerCase()));
    if (q.maxFee != null) list = list.filter(e => e.fee <= q.maxFee);
    if (q.nri) list = list.filter(e => e.accepts_nri || e.category === 'nri');
    if (q.q) { const s = q.q.toLowerCase(); list = list.filter(e => `${e.display_name} ${e.headline} ${e.specialties.join(' ')}`.toLowerCase().includes(s)); }
    return { experts: list.sort((a, b) => b.trust.score - a.trust.score).map(e => pub(e, e.trust)) };
  });
  app.get('/connect/experts/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const e = (await pool.query(`SELECT * FROM experts WHERE id = $1 AND status = 'verified'`, [id])).rows[0];
    if (!e) throw new HttpError(404, 'Expert not found', 'not_found');
    const reviews = (await pool.query('SELECT rating, body, created_at FROM expert_reviews WHERE expert_id = $1 ORDER BY created_at DESC LIMIT 20', [id])).rows, trust = await trustOf(e);
    return { expert: pub(e, trust), trust: { score: trust.score, tier: trust.tier, components: trust.components, explain: trust.explain }, reviews };
  });
  app.post('/connect/match', heavy, async (req) => {
    const b = z.object({ question: z.string().trim().min(5).max(800), language: z.string().max(30).optional(), maxFee: z.number().min(0).optional(), nri: z.boolean().optional() }).parse(req.body);
    const need = { ...classifyNeed(b.question), text: b.question };
    if (b.nri && !need.categories.includes('nri')) need.categories.push('nri');
    const matches = matchExperts({ need, experts: await verifiedExperts(), language: b.language, maxFee: b.maxFee, nri: b.nri });
    return { need: { categories: need.categories, wantsPersonalAdvice: need.wantsPersonalAdvice }, matches: matches.slice(0, 10), notice: need.wantsPersonalAdvice ? 'You are asking what to buy or sell. That is personalised investment advice, which only a registered investment adviser may give. FinAura does not give it.' : 'Matches are ranked by fit, trust and practicalities. You choose who to consult.', aiNotice: 'Matching is automated and may be wrong. Read the expert’s profile and disclosures before booking.' };
  });

  // ── Consultations ──────────────────────────────────────────────
  const cView = c => ({ id: c.id, kind: c.kind, status: c.status, scheduledFor: c.scheduled_for, topic: c.topic, question: c.question, fee: c.fee, paymentStatus: c.payment_status, meetingLink: c.meeting_link, expertId: c.expert_id, createdAt: c.created_at, completedAt: c.completed_at });
  const loadFor = async (id, user) => {   // returns { c, role, expert } or throws
    const c = (await pool.query('SELECT * FROM consultations WHERE id = $1', [id])).rows[0];
    if (!c) throw new HttpError(404, 'Not found', 'not_found');
    if (c.user_id === user.id) return { c, role: 'client', expert: null };
    const ex = await myExpert(user.id);
    if (ex) {
      if (ex.id === c.expert_id) return { c, role: 'expert', expert: ex };
      const j = (await pool.query(`SELECT 1 FROM consultation_experts WHERE consultation_id=$1 AND expert_id=$2 AND status='joined'`, [id, ex.id])).rowCount;
      if (j) return { c, role: 'room_expert', expert: ex };
    }
    throw new HttpError(404, 'Not found', 'not_found');
  };

  app.post('/connect/consultations', auth, async (req, reply) => {
    const b = z.object({ expertId: z.string().uuid(), kind: z.enum(CONSULT_KINDS), scheduledFor: z.string().datetime().nullable().optional(), topic: z.string().trim().min(1).max(120), question: z.string().trim().min(5).max(1500), intake: z.record(z.string().max(40), z.string().max(300)).default({}), originalAdvice: z.string().trim().max(3000).nullable().optional() }).parse(req.body);
    const e = (await pool.query(`SELECT * FROM experts WHERE id = $1 AND status = 'verified'`, [b.expertId])).rows[0];
    if (!e) throw new HttpError(404, 'Expert not found', 'not_found');
    if (e.user_id === req.user.id) throw new HttpError(400, 'You cannot book yourself', 'bad_request');
    if (b.kind === 'second_opinion' && !b.originalAdvice) throw new HttpError(400, 'Paste the advice you want reviewed', 'validation');
    if (['audio', 'video', 'chat'].includes(b.kind)) {
      if (!b.scheduledFor) throw new HttpError(400, 'Choose a time', 'validation');
      if (new Date(b.scheduledFor) <= new Date()) throw new HttpError(400, 'Choose a time in the future', 'validation');
      if (!inAvailability(e.availability, b.scheduledFor)) throw new HttpError(400, 'That time is outside this expert’s availability', 'unavailable');
    }
    const first = e.fee_model === 'free_first' && !(await pool.query(`SELECT 1 FROM consultations WHERE user_id=$1 AND expert_id=$2 AND status <> 'cancelled' AND status <> 'declined'`, [req.user.id, e.id])).rowCount;
    const fee = first ? 0 : e.fee;
    const c = (await pool.query(`INSERT INTO consultations (user_id, expert_id, kind, scheduled_for, topic, question, intake, original_advice, fee, payment_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.user.id, e.id, b.kind, b.scheduledFor ?? null, b.topic, b.question, b.intake, b.originalAdvice ?? null, fee, fee === 0 ? 'waived' : 'pending_provider'])).rows[0];
    await audit(req.user.id, 'client', 'request_consultation', c.id);
    reply.code(201); return { consultation: cView(c), disclosure: { fee: e.fee_disclosure, conflicts: e.conflicts_disclosure }, note: 'Nothing about your finances is shared until you choose to share it for this consultation.' };
  });
  app.get('/connect/consultations', auth, async (req) => ({ consultations: (await pool.query(`SELECT c.*, e.display_name AS "expertName" FROM consultations c JOIN experts e ON e.id = c.expert_id WHERE c.user_id = $1 ORDER BY c.created_at DESC`, [req.user.id])).rows.map(c => ({ ...cView(c), expertName: c.expertName })) }));
  app.get('/connect/consultations/:id', auth, async (req) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    const exp = (await pool.query('SELECT id, display_name, capacity FROM experts WHERE id = $1', [c.expert_id])).rows[0];
    const room = (await pool.query(`SELECT e.id, e.display_name AS name, ce.status FROM consultation_experts ce JOIN experts e ON e.id = ce.expert_id WHERE ce.consultation_id = $1`, [c.id])).rows;
    const share = (await pool.query(`SELECT expert_id AS "expertId", scope, status, expires_at AS "expiresAt" FROM data_shares WHERE consultation_id = $1`, [c.id])).rows;
    return { consultation: cView(c), role, expert: { id: exp.id, name: exp.display_name, capacity: CAPACITIES[exp.capacity]?.label }, room, ...(role === 'client' ? { shares: share, originalAdvice: c.original_advice } : {}) };
  });
  app.post('/connect/consultations/:id/cancel', auth, async (req) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role === 'room_expert') throw new HttpError(403, 'Only the client or the main expert can cancel', 'forbidden');
    if (!['requested', 'confirmed'].includes(c.status)) throw new HttpError(409, 'This consultation can no longer be cancelled', 'conflict');
    await pool.query(`UPDATE consultations SET status='cancelled' WHERE id=$1`, [c.id]);
    await pool.query(`UPDATE data_shares SET status='revoked', revoked_at=now() WHERE consultation_id=$1 AND status='active'`, [c.id]);
    await audit(req.user.id, role, 'cancel_consultation', c.id); return { ok: true };
  });
  app.post('/connect/expert/consultations/:id/respond', auth, async (req) => {
    const ex = await needExpert(req.user.id), { id } = idParam.parse(req.params);
    const b = z.object({ decision: z.enum(['confirm', 'decline']), meetingLink: z.string().url().max(300).optional() }).parse(req.body);
    const c = (await pool.query('SELECT * FROM consultations WHERE id=$1 AND expert_id=$2', [id, ex.id])).rows[0];
    if (!c) throw new HttpError(404, 'Not found', 'not_found');
    if (c.status !== 'requested') throw new HttpError(409, 'Already answered', 'conflict');
    await pool.query('UPDATE consultations SET status=$2, meeting_link=$3 WHERE id=$1', [id, b.decision === 'confirm' ? 'confirmed' : 'declined', b.meetingLink ?? null]);
    await audit(req.user.id, 'expert', `${b.decision}_consultation`, id); return { status: b.decision === 'confirm' ? 'confirmed' : 'declined' };
  });
  app.post('/connect/expert/consultations/:id/complete', auth, async (req) => {
    const ex = await needExpert(req.user.id), { id } = idParam.parse(req.params);
    const r = await pool.query(`UPDATE consultations SET status='completed', completed_at=now() WHERE id=$1 AND expert_id=$2 AND status='confirmed' RETURNING id`, [id, ex.id]);
    if (!r.rowCount) throw new HttpError(409, 'Only a confirmed consultation can be completed', 'conflict');
    return { status: 'completed', note: 'Add action items for your client so the plan does not end with the call.' };
  });
  app.post('/connect/consultations/:id/review', auth, async (req, reply) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can review', 'forbidden');
    if (c.status !== 'completed') throw new HttpError(409, 'You can review after the consultation is completed', 'conflict');
    const b = z.object({ rating: z.number().int().min(1).max(5), text: z.string().trim().max(800).optional() }).parse(req.body);
    try { await pool.query('INSERT INTO expert_reviews (expert_id, consultation_id, user_id, rating, body) VALUES ($1,$2,$3,$4,$5)', [c.expert_id, c.id, req.user.id, b.rating, b.text ?? null]); } catch (e) { if (e.code === '23505') throw new HttpError(409, 'You already reviewed this consultation', 'conflict'); throw e; }
    reply.code(201); return { ok: true };
  });

  // ── Consent-based data sharing ─────────────────────────────────
  app.post('/connect/consultations/:id/share', auth, async (req) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can share their data', 'forbidden');
    if (!['requested', 'confirmed'].includes(c.status)) throw new HttpError(409, 'Data can only be shared for an open consultation', 'conflict');
    const b = z.object({ scope: scopeSchema, expertId: z.string().uuid().optional(), expiresInDays: z.number().int().min(1).max(90).default(14) }).parse(req.body);
    if (!SCOPES.some(k => b.scope[k])) throw new HttpError(400, 'Choose at least one thing to share', 'validation');
    const expertId = b.expertId ?? c.expert_id;
    if (expertId !== c.expert_id && !(await pool.query(`SELECT 1 FROM consultation_experts WHERE consultation_id=$1 AND expert_id=$2 AND status='joined'`, [c.id, expertId])).rowCount) throw new HttpError(400, 'That expert is not part of this consultation', 'validation');
    await pool.query(`INSERT INTO data_shares (consultation_id, expert_id, user_id, scope, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
      ON CONFLICT (consultation_id, expert_id) DO UPDATE SET scope=$4, status='active', granted_at=now(), revoked_at=NULL, expires_at = now() + ($5 || ' days')::interval`, [c.id, expertId, req.user.id, b.scope, String(b.expiresInDays)]);
    await audit(req.user.id, 'client', 'grant_share', c.id, { expertId, scope: b.scope });
    return { ok: true, note: 'You can narrow or revoke this at any time. The expert only sees the items you ticked, until it expires.' };
  });
  app.post('/connect/consultations/:id/share/revoke', auth, async (req) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can revoke', 'forbidden');
    const r = await pool.query(`UPDATE data_shares SET status='revoked', revoked_at=now() WHERE consultation_id=$1 AND status='active'`, [c.id]);
    await audit(req.user.id, 'client', 'revoke_share', c.id); return { revoked: r.rowCount };
  });
  app.get('/connect/consultations/:id/share/log', auth, async (req) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can view the access log', 'forbidden');
    return { log: (await pool.query(`SELECT l.what, l.at, e.display_name AS expert FROM share_access_log l JOIN data_shares s ON s.id = l.share_id JOIN experts e ON e.id = s.expert_id WHERE s.consultation_id = $1 ORDER BY l.id DESC LIMIT 100`, [c.id])).rows };
  });
  app.post('/connect/consultations/:id/documents', auth, async (req, reply) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can add documents', 'forbidden');
    const b = z.object({ title: z.string().trim().min(1).max(120), kind: z.enum(['insurance', 'loan', 'tax', 'statement', 'advice', 'other']), text: z.string().trim().min(5).max(12000) }).parse(req.body);
    const r = (await pool.query('INSERT INTO consult_documents (consultation_id, user_id, title, kind, body) VALUES ($1,$2,$3,$4,$5) RETURNING id', [c.id, req.user.id, b.title, b.kind, b.text])).rows[0];
    reply.code(201); return { id: r.id, note: 'The expert can read documents only if you also tick "documents" when sharing.' };
  });

  // expert reads client data: only what is actively shared with this expert
  async function sharedFor(c, ex, whatFor) {
    const sh = (await pool.query(`SELECT * FROM data_shares WHERE consultation_id=$1 AND expert_id=$2 AND status='active' AND expires_at > now()`, [c.id, ex.id])).rows[0];
    if (!sh) return { shared: {}, scope: null };
    const sc = sh.scope, today = todayStr(), shared = {}, seen = [];
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [c.user_id])).rows[0];
    const needAnalysis = sc.netWorth || sc.wellness || sc.behaviour || sc.plan || sc.allocation || sc.profile;
    const a = needAnalysis ? await analyze(pool, user, today) : null;
    if (sc.profile) { shared.profile = { age: a.s.profile.age, retirementAge: a.s.profile.retirementAge, dependents: a.s.profile.dependents }; seen.push('profile'); }
    if (sc.netWorth) { shared.netWorth = Math.round(a.s.nw.netWorth); seen.push('netWorth'); }
    if (sc.wellness) { shared.wellness = a.wellness.ready ? { score: a.wellness.score, weakest: a.wellness.weakest, components: a.wellness.components } : null; seen.push('wellness'); }
    if (sc.behaviour) { const b = behaviourOf(a.s.ctx, today); shared.behaviour = b.status === 'insufficient_data' ? null : { flags: (b.patterns ?? []).filter(p => p.severity !== 'good').map(p => p.label) }; seen.push('behaviour'); }
    if (sc.plan) { shared.plan = a.retirement.ready ? { retirementReadiness: Math.round(a.retirement.readiness * 100) / 100 } : null; seen.push('plan'); }
    if (sc.allocation) { shared.allocation = a.s.nw.allocation.map(x => ({ group: x.group, weight: Math.round(x.weight * 100) / 100 })); seen.push('allocation'); }
    if (sc.documents) { shared.documents = (await pool.query('SELECT title, kind, body FROM consult_documents WHERE consultation_id = $1', [c.id])).rows; seen.push('documents'); }
    await pool.query('INSERT INTO share_access_log (share_id, what) VALUES ($1,$2)', [sh.id, `${whatFor}: ${seen.join(',') || 'none'}`]);
    return { shared, scope: sc };
  }
  app.get('/connect/expert/consultations/:id/brief', heavy, async (req) => {
    const { c, role, expert } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role === 'client') throw new HttpError(403, 'Experts only', 'forbidden');
    if (!['requested', 'confirmed', 'completed'].includes(c.status)) throw new HttpError(409, 'Consultation is closed', 'conflict');
    const { shared, scope } = await sharedFor(c, expert, 'brief');
    const brief = buildBrief({ consultation: c, shared: Object.fromEntries(Object.entries(shared).filter(([k]) => k !== 'documents' && k !== 'profile')) });
    const user = (await pool.query('SELECT name FROM users WHERE id=$1', [c.user_id])).rows[0];
    const summary = await app.llm.narrate({ userId: req.user.id, kind: 'connect_brief', instruction: 'Write a neutral 3-4 sentence pre-consultation summary for the expert. Do not give advice or recommendations. Say clearly what information is missing.', facts: { topic: c.topic, question: c.question, intake: c.intake, shared } });
    return { client: { name: user.name }, consultation: cView(c), shared, scopeGranted: scope, brief: { ...brief, aiSummary: summary ?? null }, note: scope ? 'Showing only what the client has chosen to share with you.' : 'The client has not shared any financial data with you.' };
  });

  // ── Messages (participants only; AI posts are labelled) ────────
  app.get('/connect/consultations/:id/messages', auth, async (req) => {
    const { c } = await loadFor(idParam.parse(req.params).id, req.user);
    return { messages: (await pool.query(`SELECT m.id, m.author_kind AS "authorKind", m.body, m.created_at, COALESCE(u.name, 'FinAura AI') AS author FROM consult_messages m LEFT JOIN users u ON u.id = m.author_user_id WHERE m.consultation_id = $1 ORDER BY m.id`, [c.id])).rows.map(m => ({ ...m, label: m.authorKind === 'ai' ? 'AI assistant' : m.authorKind === 'expert' ? 'Verified expert' : 'Client' })) };
  });
  app.post('/connect/consultations/:id/messages', auth, async (req, reply) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (['cancelled', 'declined'].includes(c.status)) throw new HttpError(409, 'This consultation is closed', 'conflict');
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    const r = (await pool.query('INSERT INTO consult_messages (consultation_id, author_user_id, author_kind, body) VALUES ($1,$2,$3,$4) RETURNING id', [c.id, req.user.id, role === 'client' ? 'user' : 'expert', body])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.post('/connect/consultations/:id/ai-summary', heavy, async (req) => {
    const { c } = await loadFor(idParam.parse(req.params).id, req.user);
    const msgs = (await pool.query(`SELECT author_kind, body FROM consult_messages WHERE consultation_id=$1 AND author_kind <> 'ai' ORDER BY id DESC LIMIT 30`, [c.id])).rows.reverse();
    if (!msgs.length) throw new HttpError(400, 'No messages to summarise yet', 'bad_request');
    const text = await app.llm.narrate({ userId: req.user.id, kind: 'connect_msgs', instruction: 'Summarise this consultation chat in at most 5 bullet-like sentences: points agreed, open questions, next steps. Do not add advice of your own.', facts: { topic: c.topic, messages: msgs.map(m => ({ from: m.author_kind, text: m.body })) } });
    if (!text) return { summary: null, note: 'AI summaries need a GROQ_API_KEY to be configured.' };
    await pool.query(`INSERT INTO consult_messages (consultation_id, author_user_id, author_kind, body) VALUES ($1, NULL, 'ai', $2)`, [c.id, `[AI summary] ${text}`.slice(0, 2000)]);
    return { summary: text, label: 'AI assistant' };
  });

  // ── Multi-expert rooms ─────────────────────────────────────────
  app.post('/connect/consultations/:id/invite-expert', auth, async (req, reply) => {
    const { c, role } = await loadFor(idParam.parse(req.params).id, req.user);
    if (role !== 'client') throw new HttpError(403, 'Only the client can invite another expert', 'forbidden');
    const { expertId } = z.object({ expertId: z.string().uuid() }).parse(req.body);
    if (expertId === c.expert_id) throw new HttpError(400, 'Already the main expert', 'bad_request');
    if (!(await pool.query(`SELECT 1 FROM experts WHERE id=$1 AND status='verified'`, [expertId])).rowCount) throw new HttpError(404, 'Expert not found', 'not_found');
    if ((await pool.query(`SELECT count(*)::int AS n FROM consultation_experts WHERE consultation_id=$1 AND status <> 'declined'`, [c.id])).rows[0].n >= 3) throw new HttpError(400, 'A room can have up to 3 additional experts', 'limit');
    const r = await pool.query(`INSERT INTO consultation_experts (consultation_id, expert_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [c.id, expertId]);
    if (!r.rowCount) throw new HttpError(409, 'Already invited', 'conflict');
    reply.code(201); return { id: r.rows[0].id, note: 'The expert sees nothing until they join, and still only sees data you share with them specifically.' };
  });
  app.get('/connect/expert/room-invites', auth, async (req) => { const ex = await needExpert(req.user.id); return { invites: (await pool.query(`SELECT ce.id, c.topic, c.question FROM consultation_experts ce JOIN consultations c ON c.id = ce.consultation_id WHERE ce.expert_id = $1 AND ce.status = 'invited'`, [ex.id])).rows }; });
  app.post('/connect/expert/room-invites/:id/respond', auth, async (req) => {
    const ex = await needExpert(req.user.id), { id } = idParam.parse(req.params), { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    const r = await pool.query(`UPDATE consultation_experts SET status=$3 WHERE id=$1 AND expert_id=$2 AND status='invited' RETURNING id`, [id, ex.id, accept ? 'joined' : 'declined']);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found'); return { status: accept ? 'joined' : 'declined' };
  });

  // ── Action tracking, expert workspace / CRM ────────────────────
  app.post('/connect/expert/consultations/:id/actions', auth, async (req, reply) => {
    const ex = await needExpert(req.user.id), { id } = idParam.parse(req.params);
    const b = z.object({ text: z.string().trim().min(1).max(300), dueOn: DAY.nullable().optional() }).parse(req.body);
    const c = (await pool.query(`SELECT user_id FROM consultations WHERE id=$1 AND expert_id=$2 AND status IN ('confirmed','completed')`, [id, ex.id])).rows[0];
    if (!c) throw new HttpError(404, 'Not found', 'not_found');
    const r = (await pool.query('INSERT INTO action_items (consultation_id, user_id, expert_id, text, due_on) VALUES ($1,$2,$3,$4,$5) RETURNING id', [id, c.user_id, ex.id, b.text, b.dueOn ?? null])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.get('/connect/actions', auth, async (req) => ({ actions: (await pool.query(`SELECT a.id, a.text, a.due_on AS "dueOn", a.status, a.consultation_id AS "consultationId", e.display_name AS expert FROM action_items a JOIN experts e ON e.id = a.expert_id WHERE a.user_id = $1 ORDER BY (a.status='done'), a.due_on NULLS LAST`, [req.user.id])).rows }));
  app.patch('/connect/actions/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params), { status } = z.object({ status: z.enum(['open', 'done']) }).parse(req.body);
    if (!(await pool.query('UPDATE action_items SET status=$3 WHERE id=$1 AND user_id=$2', [id, req.user.id, status])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { status };
  });
  app.get('/connect/expert/workspace', auth, async (req) => {
    const ex = await needExpert(req.user.id, false);
    const cons = (await pool.query(`SELECT c.*, u.name AS "clientName" FROM consultations c JOIN users u ON u.id = c.user_id WHERE c.expert_id = $1 ORDER BY c.created_at DESC`, [ex.id])).rows;
    const clients = Object.values(cons.reduce((m, c) => { (m[c.user_id] ??= { name: c.clientName, consultations: 0, last: c.created_at }).consultations++; return m; }, {}));
    const open = (await pool.query(`SELECT count(*)::int AS n FROM action_items WHERE expert_id=$1 AND status='open'`, [ex.id])).rows[0].n;
    const earned = cons.filter(c => c.status === 'completed').reduce((s, c) => s + c.fee, 0);
    return { status: ex.status, pending: cons.filter(c => c.status === 'requested').map(c => ({ ...cView(c), clientName: c.clientName })), upcoming: cons.filter(c => c.status === 'confirmed').map(c => ({ ...cView(c), clientName: c.clientName })), clients, openFollowUps: open, feesRecorded: earned, completed: cons.filter(c => c.status === 'completed').length, trust: (({ score, tier }) => ({ score, tier }))(await trustOf(ex)), note: 'Fees are recorded for your own bookkeeping. Payments are settled directly with clients in this version.' };
  });
  app.post('/connect/expert/notes', auth, async (req, reply) => {
    const ex = await needExpert(req.user.id), b = z.object({ consultationId: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(req.body);
    if (!(await pool.query('SELECT 1 FROM consultations WHERE id=$1 AND expert_id=$2', [b.consultationId, ex.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    const r = (await pool.query('INSERT INTO expert_notes (expert_id, consultation_id, note) VALUES ($1,$2,$3) RETURNING id', [ex.id, b.consultationId, b.note])).rows[0];
    reply.code(201); return { id: r.id, note: 'Private to you. Clients cannot see these notes.' };
  });
  app.get('/connect/expert/notes', auth, async (req) => {
    const ex = await needExpert(req.user.id), { consultationId } = z.object({ consultationId: z.string().uuid() }).parse(req.query);
    return { notes: (await pool.query('SELECT id, note, created_at FROM expert_notes WHERE expert_id=$1 AND consultation_id=$2 ORDER BY created_at DESC', [ex.id, consultationId])).rows };
  });

  // ── Complaints ─────────────────────────────────────────────────
  app.post('/connect/complaints', auth, async (req, reply) => {
    const b = z.object({ expertId: z.string().uuid(), consultationId: z.string().uuid().optional(), body: z.string().trim().min(10).max(1500) }).parse(req.body);
    if (!(await pool.query('SELECT 1 FROM consultations WHERE user_id=$1 AND expert_id=$2', [req.user.id, b.expertId])).rowCount) throw new HttpError(403, 'You can only complain about an expert you have booked', 'forbidden');
    const r = (await pool.query('INSERT INTO complaints (user_id, expert_id, consultation_id, body) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, b.expertId, b.consultationId ?? null, b.body])).rows[0];
    await audit(req.user.id, 'client', 'complaint', r.id);
    reply.code(201); return { id: r.id, note: 'A FinAura reviewer will look at this. For regulated advice you can also complain to the relevant regulator or the expert’s professional body.' };
  });

  // ── Academy ────────────────────────────────────────────────────
  app.post('/connect/expert/academy', auth, async (req, reply) => {
    const ex = await needExpert(req.user.id), b = z.object({ title: z.string().trim().min(1).max(120), kind: z.enum(['webinar', 'course', 'article']), description: z.string().trim().min(10).max(1500), startsAt: z.string().datetime().nullable().optional(), fee: z.number().min(0).max(1e6).default(0) }).parse(req.body);
    const r = (await pool.query('INSERT INTO academy_items (expert_id, title, kind, description, starts_at, fee) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [ex.id, b.title, b.kind, b.description, b.startsAt ?? null, b.fee])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.get('/connect/academy', auth, async (req) => ({ items: (await pool.query(`SELECT a.id, a.title, a.kind, a.description, a.starts_at AS "startsAt", a.fee::float AS fee, e.display_name AS expert, e.capacity, (SELECT count(*)::int FROM academy_enrollments x WHERE x.item_id = a.id) AS enrolled, EXISTS(SELECT 1 FROM academy_enrollments x WHERE x.item_id = a.id AND x.user_id = $1) AS "enrolledByMe" FROM academy_items a JOIN experts e ON e.id = a.expert_id WHERE e.status = 'verified' ORDER BY a.starts_at NULLS LAST, a.created_at DESC`, [req.user.id])).rows }));
  app.post('/connect/academy/:id/enroll', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query(`SELECT 1 FROM academy_items a JOIN experts e ON e.id=a.expert_id WHERE a.id=$1 AND e.status='verified'`, [id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    await pool.query('INSERT INTO academy_enrollments (item_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.user.id]); return { ok: true, note: 'Fees, if any, are settled directly with the expert in this version.' };
  });

  // ── Community Q&A (answers only from verified experts) ─────────
  app.post('/connect/community', auth, async (req, reply) => {
    const b = z.object({ title: z.string().trim().min(5).max(140), body: z.string().trim().max(1500).default(''), category: cat, anonymous: z.boolean().default(true) }).parse(req.body);
    const r = (await pool.query('INSERT INTO community_questions (user_id, title, body, category, anonymous) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user.id, b.title, b.body, b.category, b.anonymous])).rows[0];
    reply.code(201); return { id: r.id, note: 'Do not post account numbers, PAN, Aadhaar or other personal identifiers.' };
  });
  app.get('/connect/community', auth, async (req) => {
    const { category } = z.object({ category: cat.optional() }).parse(req.query);
    return { questions: (await pool.query(`SELECT q.id, q.title, q.category, q.created_at, CASE WHEN q.anonymous THEN 'Anonymous' ELSE u.name END AS "askedBy", (SELECT count(*)::int FROM community_answers a WHERE a.question_id = q.id AND NOT a.hidden) AS answers FROM community_questions q JOIN users u ON u.id = q.user_id WHERE NOT q.hidden AND ($1::text IS NULL OR q.category = $1) ORDER BY q.created_at DESC LIMIT 50`, [category ?? null])).rows };
  });
  app.get('/connect/community/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = (await pool.query(`SELECT q.id, q.title, q.body, q.category, q.created_at, CASE WHEN q.anonymous THEN 'Anonymous' ELSE u.name END AS "askedBy" FROM community_questions q JOIN users u ON u.id = q.user_id WHERE q.id = $1 AND NOT q.hidden`, [id])).rows[0];
    if (!q) throw new HttpError(404, 'Not found', 'not_found');
    const answers = (await pool.query(`SELECT a.id, a.body, a.created_at, e.id AS "expertId", e.display_name AS expert, e.capacity FROM community_answers a JOIN experts e ON e.id = a.expert_id WHERE a.question_id = $1 AND NOT a.hidden AND e.status = 'verified' ORDER BY a.created_at`, [id])).rows.map(a => ({ ...a, capacityLabel: CAPACITIES[a.capacity]?.label }));
    return { question: q, answers, notice: 'Community answers are general information, not personal advice.' };
  });
  app.post('/connect/community/:id/answers', auth, async (req, reply) => {
    const ex = await needExpert(req.user.id), { id } = idParam.parse(req.params), { body } = z.object({ body: z.string().trim().min(10).max(2000) }).parse(req.body);
    if (!(await pool.query('SELECT 1 FROM community_questions WHERE id=$1 AND NOT hidden', [id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    const r = (await pool.query('INSERT INTO community_answers (question_id, expert_id, body) VALUES ($1,$2,$3) RETURNING id', [id, ex.id, body])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.post('/connect/admin/community/:id/hide', auth, async (req) => {
    await needAdmin(req); const { id } = idParam.parse(req.params);
    const r = await pool.query('UPDATE community_questions SET hidden = true WHERE id = $1', [id]);
    if (!r.rowCount) { const a = await pool.query('UPDATE community_answers SET hidden = true WHERE id = $1', [id]); if (!a.rowCount) throw new HttpError(404, 'Not found', 'not_found'); }
    await audit(req.user.id, 'admin', 'hide_content', id); return { ok: true };
  });
}
