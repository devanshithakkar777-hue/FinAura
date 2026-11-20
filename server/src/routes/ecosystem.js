import { z } from 'zod';
import { HttpError } from '../lib/security.js';
import { todayStr } from '../lib/dates.js';
import { loadWealthState } from './planning.js';
import { awardXp } from '../services/gamify.js';
import { analyze, policiesOf, behaviourOf } from '../services/analysis.js';
import { compareScenarios, CATALOG } from '../engines/scenarios.js';
import {
  wellnessScore, benchmarks, dividendSummary, splitRatio, settleExpenses, estateReadiness, transferModel,
  privateSummary, esgView, EXERCISES, publicExercises, biasProfile, LESSONS, publicLessons, nextLessons,
  LIFE_EVENTS, publicLifeEvents, proposeTasks, detectFraudRisk, regexExtract, CLAIM_CHECKLIST,
} from '../engines/ecosystem.js';

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const toAsset = r => ({ id: r.id, kind: r.kind, name: r.name, currency: r.currency, fxRate: r.fx_rate, invested: r.invested, currentValue: r.current_value, startDate: r.start_date, lockinUntil: r.lockin_until, monthlyIncome: r.monthly_income, annualCosts: r.annual_costs, loanOutstanding: r.loan_outstanding });

export async function ecosystemRoutes(app) {
  const { pool } = app;
  const auth = { preHandler: app.requireAuth };
  const heavy = { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const idParam = z.object({ id: z.string().uuid() });

  const privateOf = async uid => (await pool.query('SELECT * FROM private_assets WHERE user_id = $1 ORDER BY created_at', [uid])).rows.map(toAsset);
  const analysis = (user, today) => analyze(pool, user, today);

  // ── Wellness, benchmarks ───────────────────────────────────────
  app.get('/wellness', auth, async (req) => {
    const a = await analysis(req.user, todayStr());
    const done = new Set((await pool.query('SELECT lesson_id FROM learn_progress WHERE user_id = $1', [req.user.id])).rows.map(r => r.lesson_id));
    return { wellness: a.wellness, learnNext: nextLessons(done, a.wellness.weakest) };
  });
  app.get('/benchmarks', auth, async (req) => {
    const a = await analysis(req.user, todayStr()), b = benchmarks({ profile: a.s.profile, nw: a.s.nw, emergency: a.emergency, insurance: a.insurance });
    let cohort = { available: false, note: 'Not enough opted-in users in your age band to compare anonymously (minimum 20).' };
    const age = a.s.profile.age;
    if (age) {
      const rows = (await pool.query('SELECT annual_income::float AS i, monthly_expenses::float AS e FROM financial_profile WHERE age BETWEEN $1 AND $2 AND annual_income > 0 AND monthly_expenses IS NOT NULL AND user_id <> $3', [age - 5, age + 5, req.user.id])).rows;
      if (rows.length >= 20) cohort = { available: true, n: rows.length, ageBand: `${age - 5}–${age + 5}`, medianSavingsRate: Math.round(median(rows.map(r => (r.i / 12 - r.e) / (r.i / 12))) * 100) / 100, note: 'Medians across FinAura users in your age band. Self-reported and not representative of the population.' };
    }
    return { ...b, cohort };
  });

  // ── Family IQ ──────────────────────────────────────────────────
  const myHousehold = async uid => (await pool.query(`SELECT h.* FROM households h JOIN household_members m ON m.household_id = h.id WHERE m.user_id = $1 AND m.status = 'active' LIMIT 1`, [uid])).rows[0] ?? null;
  const emailOf = u => String(u.email).toLowerCase();
  const lvl = z.enum(['summary', 'full']);

  app.post('/household', auth, async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1).max(60), shareLevel: lvl.default('summary') }).parse(req.body);
    if (await myHousehold(req.user.id)) throw new HttpError(409, 'You are already in a household', 'conflict');
    const h = (await pool.query('INSERT INTO households (owner_id, name) VALUES ($1,$2) RETURNING id, name', [req.user.id, b.name])).rows[0];
    await pool.query(`INSERT INTO household_members (household_id, email, user_id, status, share_level, consented_at) VALUES ($1,$2,$3,'active',$4,now())`, [h.id, emailOf(req.user), req.user.id, b.shareLevel]);
    reply.code(201); return { household: h };
  });
  app.get('/household', auth, async (req) => {
    const h = await myHousehold(req.user.id);
    const invitations = (await pool.query(`SELECT m.household_id AS id, h.name, u.name AS "invitedBy" FROM household_members m JOIN households h ON h.id = m.household_id JOIN users u ON u.id = h.owner_id WHERE lower(m.email) = $1 AND m.status = 'invited'`, [emailOf(req.user)])).rows;
    if (!h) return { household: null, invitations };
    const members = (await pool.query(`SELECT m.email, m.status, m.share_level AS "shareLevel", u.name FROM household_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.household_id = $1 ORDER BY m.created_at`, [h.id])).rows;
    return { household: { id: h.id, name: h.name, isOwner: h.owner_id === req.user.id }, members, invitations };
  });
  app.post('/household/invite', auth, async (req, reply) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(req.body);
    const h = await myHousehold(req.user.id);
    if (!h || h.owner_id !== req.user.id) throw new HttpError(403, 'Only the household owner can invite', 'forbidden');
    if (email === emailOf(req.user)) throw new HttpError(400, 'You cannot invite yourself', 'bad_request');
    const n = (await pool.query('SELECT count(*)::int AS n FROM household_members WHERE household_id = $1', [h.id])).rows[0].n;
    if (n >= 6) throw new HttpError(400, 'A household can have up to 6 members', 'limit');
    const r = await pool.query(`INSERT INTO household_members (household_id, email, status) VALUES ($1,$2,'invited') ON CONFLICT DO NOTHING RETURNING email`, [h.id, email]);
    if (!r.rowCount) throw new HttpError(409, 'Already invited or a member', 'conflict');
    reply.code(201); return { invited: email, note: 'They see nothing of yours until they accept, and they choose what they share.' };
  });
  app.post('/household/accept', auth, async (req) => {
    const b = z.object({ householdId: z.string().uuid(), shareLevel: lvl.default('summary') }).parse(req.body);
    if (await myHousehold(req.user.id)) throw new HttpError(409, 'Leave your current household first', 'conflict');
    const r = await pool.query(`UPDATE household_members SET status='active', user_id=$3, share_level=$4, consented_at=now() WHERE household_id=$1 AND lower(email)=$2 AND status='invited' RETURNING household_id`, [b.householdId, emailOf(req.user), req.user.id, b.shareLevel]);
    if (!r.rowCount) throw new HttpError(404, 'Invitation not found', 'not_found');
    return { ok: true };
  });
  app.post('/household/decline', auth, async (req) => {
    const b = z.object({ householdId: z.string().uuid() }).parse(req.body);
    await pool.query(`DELETE FROM household_members WHERE household_id=$1 AND lower(email)=$2 AND status='invited'`, [b.householdId, emailOf(req.user)]);
    return { ok: true };
  });
  app.put('/household/share', auth, async (req) => {
    const b = z.object({ shareLevel: lvl }).parse(req.body);
    const h = await myHousehold(req.user.id); if (!h) throw new HttpError(404, 'No household', 'not_found');
    await pool.query('UPDATE household_members SET share_level = $3 WHERE household_id = $1 AND user_id = $2', [h.id, req.user.id, b.shareLevel]);
    return { shareLevel: b.shareLevel };
  });
  app.delete('/household/leave', auth, async (req) => {
    const h = await myHousehold(req.user.id); if (!h) throw new HttpError(404, 'No household', 'not_found');
    if (h.owner_id === req.user.id) await pool.query('DELETE FROM households WHERE id = $1', [h.id]);
    else await pool.query('DELETE FROM household_members WHERE household_id = $1 AND user_id = $2', [h.id, req.user.id]);
    return { ok: true, dissolved: h.owner_id === req.user.id };
  });
  app.get('/household/dashboard', heavy, async (req) => {
    const h = await myHousehold(req.user.id); if (!h) throw new HttpError(404, 'No household', 'not_found');
    const ms = (await pool.query(`SELECT m.user_id, m.share_level, u.name FROM household_members m JOIN users u ON u.id = m.user_id WHERE m.household_id = $1 AND m.status='active'`, [h.id])).rows;
    const today = todayStr(), out = [];
    for (const m of ms) {
      const user = (await pool.query('SELECT * FROM users WHERE id = $1', [m.user_id])).rows[0];
      const a = await analysis(user, today), self = m.user_id === req.user.id, full = self || m.share_level === 'full';
      out.push({ name: m.name, you: self, shareLevel: m.share_level, netWorth: Math.round(a.s.nw.netWorth), ...(full ? { totalAssets: Math.round(a.s.nw.totalAssets), totalDebt: Math.round(a.s.nw.totalDebt), wellness: a.wellness.ready ? a.wellness.score : null } : {}) });
    }
    return { household: { id: h.id, name: h.name }, members: out, combinedNetWorth: out.reduce((s, m) => s + m.netWorth, 0), note: 'Each member chooses what the others see. Combined net worth uses every member’s consented summary.' };
  });
  app.post('/household/expenses', auth, async (req, reply) => {
    const b = z.object({ amount: z.number().positive().max(1e9), label: z.string().trim().min(1).max(80), day: DAY }).parse(req.body);
    const h = await myHousehold(req.user.id); if (!h) throw new HttpError(404, 'No household', 'not_found');
    const r = (await pool.query('INSERT INTO shared_expenses (household_id, paid_by, amount, label, day) VALUES ($1,$2,$3,$4,$5) RETURNING id', [h.id, req.user.id, b.amount, b.label, b.day])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.get('/household/expenses', auth, async (req) => {
    const h = await myHousehold(req.user.id); if (!h) throw new HttpError(404, 'No household', 'not_found');
    const exp = (await pool.query(`SELECT e.id, e.amount::float AS amount, e.label, e.day, e.paid_by AS "paidBy", u.name AS "paidByName" FROM shared_expenses e JOIN users u ON u.id = e.paid_by WHERE e.household_id = $1 ORDER BY e.day DESC, e.created_at DESC`, [h.id])).rows;
    const mem = (await pool.query(`SELECT m.user_id AS "userId", u.name, COALESCE(p.annual_income, 0)::float AS income FROM household_members m JOIN users u ON u.id = m.user_id LEFT JOIN financial_profile p ON p.user_id = m.user_id WHERE m.household_id = $1 AND m.status = 'active'`, [h.id])).rows;
    const equal = mem.some(m => m.income <= 0), members = mem.map(m => ({ ...m, income: equal ? 1 : m.income }));
    const s = settleExpenses(exp, members), names = Object.fromEntries(mem.map(m => [m.userId, m.name]));
    return { expenses: exp, settlement: { ...s, method: equal ? 'equal split (income not set for everyone)' : s.method, balances: s.balances.map(b => ({ ...b, name: names[b.userId] })), transfers: s.transfers.map(t => ({ ...t, fromName: names[t.from], toName: names[t.to] })) } };
  });

  // ── Estate & legacy ────────────────────────────────────────────
  const estateState = async user => {
    const plan = (await pool.query('SELECT * FROM estate_plan WHERE user_id = $1', [user.id])).rows[0] ?? {};
    const ben = (await pool.query('SELECT id, name, relation, share_pct::float AS "sharePct", minor FROM beneficiaries WHERE user_id = $1 ORDER BY name', [user.id])).rows;
    const s = await loadWealthState(pool, user, todayStr()), priv = privateSummary(await privateOf(user.id), todayStr());
    const estateValue = s.nw.netWorth + priv.total - (await privateOf(user.id)).reduce((t, a) => t + a.loanOutstanding * a.fxRate, 0);
    return { plan: { willExists: plan.will_exists ?? false, willUpdatedOn: plan.will_updated_on ?? null, guardianNamed: plan.guardian_named ?? false, powerOfAttorney: plan.power_of_attorney ?? false, nomineesUpdatedOn: plan.nominees_updated_on ?? null, notes: plan.notes ?? null }, ben, s, estateValue };
  };
  app.get('/estate', auth, async (req) => {
    const e = await estateState(req.user), today = todayStr();
    return { plan: e.plan, beneficiaries: e.ben, readiness: estateReadiness({ plan: e.plan, beneficiaries: e.ben, netWorth: e.estateValue, dependents: e.s.profile.dependents ?? 0, today }), transfer: transferModel({ estateValue: Math.max(0, e.estateValue), beneficiaries: e.ben }) };
  });
  app.put('/estate/plan', auth, async (req) => {
    const b = z.object({ willExists: z.boolean(), willUpdatedOn: DAY.nullable().optional(), guardianNamed: z.boolean().default(false), powerOfAttorney: z.boolean().default(false), nomineesUpdatedOn: DAY.nullable().optional(), notes: z.string().max(400).nullable().optional() }).parse(req.body);
    await pool.query(`INSERT INTO estate_plan (user_id, will_exists, will_updated_on, guardian_named, power_of_attorney, nominees_updated_on, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO UPDATE SET will_exists=$2, will_updated_on=$3, guardian_named=$4, power_of_attorney=$5, nominees_updated_on=$6, notes=$7, updated_at=now()`, [req.user.id, b.willExists, b.willUpdatedOn ?? null, b.guardianNamed, b.powerOfAttorney, b.nomineesUpdatedOn ?? null, b.notes ?? null]);
    return { ok: true };
  });
  app.post('/estate/beneficiaries', auth, async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1).max(80), relation: z.string().trim().min(1).max(40), sharePct: z.number().gt(0).max(100), minor: z.boolean().default(false) }).parse(req.body);
    const cur = (await pool.query('SELECT COALESCE(sum(share_pct),0)::float AS t FROM beneficiaries WHERE user_id = $1', [req.user.id])).rows[0].t;
    if (cur + b.sharePct > 100.001) throw new HttpError(400, `Shares would total ${cur + b.sharePct}%. They cannot exceed 100%.`, 'validation');
    const r = (await pool.query('INSERT INTO beneficiaries (user_id, name, relation, share_pct, minor) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user.id, b.name, b.relation, b.sharePct, b.minor])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.delete('/estate/beneficiaries/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query('DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2', [id, req.user.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { ok: true };
  });

  // ── Private, global & real-estate assets ───────────────────────
  const assetBody = z.object({
    kind: z.enum(['property', 'pe_vc', 'startup', 'art', 'collectible', 'p2p', 'commodity', 'foreign', 'other']), name: z.string().trim().min(1).max(80),
    currency: z.string().trim().toUpperCase().length(3).default('INR'), fxRate: z.number().positive().max(1e6).default(1),
    invested: z.number().min(0).max(1e13), currentValue: z.number().min(0).max(1e13), startDate: DAY, lockinUntil: DAY.nullable().optional(),
    monthlyIncome: z.number().min(0).max(1e11).default(0), annualCosts: z.number().min(0).max(1e11).default(0), loanOutstanding: z.number().min(0).max(1e13).default(0),
  });
  app.get('/private', auth, async (req) => {
    const today = todayStr(), assets = await privateOf(req.user.id), sum = privateSummary(assets, today);
    const s = await loadWealthState(pool, req.user, today), loans = assets.reduce((t, a) => t + a.loanOutstanding * a.fxRate, 0);
    return { ...sum, combinedNetWorth: Math.round(s.nw.netWorth + sum.total - loans), note2: 'Combined net worth adds these assets to your portfolio net worth and subtracts the loans entered here. If you also entered the same loan under Loans, it is counted twice.' };
  });
  app.post('/private', auth, async (req, reply) => {
    const b = assetBody.parse(req.body), fx = b.currency === 'INR' ? 1 : b.fxRate;
    const r = (await pool.query(`INSERT INTO private_assets (user_id, kind, name, currency, fx_rate, invested, current_value, start_date, lockin_until, monthly_income, annual_costs, loan_outstanding) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [req.user.id, b.kind, b.name, b.currency, fx, b.invested, b.currentValue, b.startDate, b.lockinUntil ?? null, b.monthlyIncome, b.annualCosts, b.loanOutstanding])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.patch('/private/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const b = z.object({ currentValue: z.number().min(0).max(1e13).optional(), fxRate: z.number().positive().max(1e6).optional(), monthlyIncome: z.number().min(0).max(1e11).optional(), annualCosts: z.number().min(0).max(1e11).optional(), loanOutstanding: z.number().min(0).max(1e13).optional() }).parse(req.body);
    const r = await pool.query(`UPDATE private_assets SET current_value = COALESCE($3, current_value), fx_rate = COALESCE($4, fx_rate), monthly_income = COALESCE($5, monthly_income), annual_costs = COALESCE($6, annual_costs), loan_outstanding = COALESCE($7, loan_outstanding) WHERE id = $1 AND user_id = $2`, [id, req.user.id, b.currentValue ?? null, b.fxRate ?? null, b.monthlyIncome ?? null, b.annualCosts ?? null, b.loanOutstanding ?? null]);
    if (!r.rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { ok: true };
  });
  app.delete('/private/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query('DELETE FROM private_assets WHERE id = $1 AND user_id = $2', [id, req.user.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { ok: true };
  });

  // ── Dividends & ESG ────────────────────────────────────────────
  app.get('/dividends', auth, async (req) => {
    const today = todayStr(), s = await loadWealthState(pool, req.user, today);
    const records = (await pool.query('SELECT id, symbol, amount::float AS amount, received_on FROM dividends WHERE user_id = $1 ORDER BY received_on DESC', [req.user.id])).rows;
    const manual = (await pool.query('SELECT COALESCE(sum(annual_income),0)::float AS a FROM manual_holdings WHERE user_id = $1', [req.user.id])).rows[0].a;
    return { records, summary: dividendSummary({ records, manualAnnualIncome: manual, marketValue: s.nw.marketValue, today }) };
  });
  app.post('/dividends', auth, async (req, reply) => {
    const b = z.object({ symbol: z.string().trim().toUpperCase().min(1).max(20), amount: z.number().positive().max(1e10), receivedOn: DAY }).parse(req.body);
    const r = (await pool.query('INSERT INTO dividends (user_id, symbol, amount, received_on) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, b.symbol, b.amount, b.receivedOn])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.delete('/dividends/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query('DELETE FROM dividends WHERE id = $1 AND user_id = $2', [id, req.user.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { ok: true };
  });
  app.get('/esg', auth, async (req) => {
    const s = await loadWealthState(pool, req.user, todayStr());
    const ratings = (await pool.query('SELECT symbol, e, s, g, excluded, source FROM esg_ratings WHERE user_id = $1', [req.user.id])).rows;
    return { ratings, view: esgView({ positions: s.ctx.positions, ratings }) };
  });
  app.put('/esg/:symbol', auth, async (req) => {
    const symbol = z.string().trim().toUpperCase().min(1).max(20).parse(req.params.symbol);
    const sc = z.number().int().min(0).max(100).nullable().optional();
    const b = z.object({ e: sc, s: sc, g: sc, excluded: z.boolean().default(false), source: z.string().max(80).nullable().optional() }).parse(req.body);
    await pool.query(`INSERT INTO esg_ratings (user_id, symbol, e, s, g, excluded, source) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, symbol) DO UPDATE SET e=$3, s=$4, g=$5, excluded=$6, source=$7`, [req.user.id, symbol, b.e ?? null, b.s ?? null, b.g ?? null, b.excluded, b.source ?? null]);
    return { ok: true };
  });
  app.delete('/esg/:symbol', auth, async (req) => { await pool.query('DELETE FROM esg_ratings WHERE user_id = $1 AND symbol = $2', [req.user.id, String(req.params.symbol).toUpperCase()]); return { ok: true }; });

  // ── Learn IQ ───────────────────────────────────────────────────
  app.get('/learn', auth, async (req) => {
    const prog = (await pool.query('SELECT lesson_id AS id, score FROM learn_progress WHERE user_id = $1', [req.user.id])).rows, done = new Set(prog.map(p => p.id));
    const a = await analysis(req.user, todayStr());
    return { lessons: publicLessons().map(l => ({ ...l, done: done.has(l.id), score: prog.find(p => p.id === l.id)?.score ?? null })), next: nextLessons(done, a.wellness.weakest) };
  });
  app.get('/learn/:id', auth, async (req) => {
    const l = LESSONS.find(x => x.id === req.params.id); if (!l) throw new HttpError(404, 'Lesson not found', 'not_found');
    return { id: l.id, title: l.title, minutes: l.minutes, body: l.body, quiz: { q: l.quiz.q, options: l.quiz.options } };
  });
  app.post('/learn/:id/answer', auth, async (req) => {
    const l = LESSONS.find(x => x.id === req.params.id); if (!l) throw new HttpError(404, 'Lesson not found', 'not_found');
    const { choice } = z.object({ choice: z.number().int().min(0).max(5) }).parse(req.body), correct = choice === l.quiz.answer;
    await pool.query(`INSERT INTO learn_progress (user_id, lesson_id, score) VALUES ($1,$2,$3) ON CONFLICT (user_id, lesson_id) DO UPDATE SET score = GREATEST(learn_progress.score, $3), completed_at = now()`, [req.user.id, l.id, correct ? 100 : 0]);
    const xp = correct ? await awardXp(pool, req.user.id, 'lesson_done', l.id) : 0;
    return { correct, correctChoice: l.quiz.answer, xp };
  });

  // ── Investor psychology lab ────────────────────────────────────
  app.get('/psych/lab', auth, async (req) => {
    const done = new Map((await pool.query('SELECT exercise_id, correct FROM bias_results WHERE user_id = $1', [req.user.id])).rows.map(r => [r.exercise_id, r.correct]));
    return { exercises: publicExercises().map(e => ({ ...e, answered: done.has(e.id), correct: done.get(e.id) ?? null })) };
  });
  app.post('/psych/lab/answer', auth, async (req) => {
    const b = z.object({ exerciseId: z.string(), choice: z.number().int().min(0).max(5) }).parse(req.body);
    const ex = EXERCISES.find(e => e.id === b.exerciseId); if (!ex) throw new HttpError(404, 'Exercise not found', 'not_found');
    const correct = b.choice === ex.answer;
    await pool.query(`INSERT INTO bias_results (user_id, exercise_id, bias, correct) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, exercise_id) DO UPDATE SET correct = $4, answered_at = now()`, [req.user.id, ex.id, ex.bias, correct]);
    const xp = await awardXp(pool, req.user.id, 'bias_exercise', ex.id);
    return { correct, correctChoice: ex.answer, why: ex.why, xp };
  });
  app.get('/psych/profile', auth, async (req) => {
    const today = todayStr(), s = await loadWealthState(pool, req.user, today), c = s.ctx;
    const results = (await pool.query('SELECT bias, correct FROM bias_results WHERE user_id = $1', [req.user.id])).rows;
    const beh = behaviourOf(c, today);
    return biasProfile(results, beh.patterns ?? []);
  });

  // ── Life events ────────────────────────────────────────────────
  app.get('/life-events', auth, async (req) => ({ catalog: publicLifeEvents(), mine: (await pool.query('SELECT id, kind, planned_on AS "plannedOn", note FROM life_events WHERE user_id = $1 ORDER BY planned_on NULLS LAST, created_at', [req.user.id])).rows }));
  app.post('/life-events', auth, async (req, reply) => {
    const b = z.object({ kind: z.enum(Object.keys(LIFE_EVENTS)), plannedOn: DAY.nullable().optional(), note: z.string().max(200).nullable().optional() }).parse(req.body);
    const r = (await pool.query('INSERT INTO life_events (user_id, kind, planned_on, note) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, b.kind, b.plannedOn ?? null, b.note ?? null])).rows[0];
    reply.code(201); return { id: r.id };
  });
  app.get('/life-events/:id/plan', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const ev = (await pool.query('SELECT kind, planned_on AS "plannedOn" FROM life_events WHERE id = $1 AND user_id = $2', [id, req.user.id])).rows[0];
    if (!ev) throw new HttpError(404, 'Not found', 'not_found');
    const t = LIFE_EVENTS[ev.kind], a = await analysis(req.user, todayStr());
    const monthsAway = ev.plannedOn ? Math.max(0, Math.round((new Date(`${ev.plannedOn}T00:00:00Z`) - new Date(`${todayStr()}T00:00:00Z`)) / 2629800000)) : null;
    return { kind: ev.kind, label: t.label, plannedOn: ev.plannedOn, monthsAway, checklist: t.checklist, suggestedWhatIfs: t.scenarios.filter(k => CATALOG[k]).map(k => ({ id: k, label: CATALOG[k].label ?? k })), yourPosition: { emergencyMonths: a.emergency.ready ? Number(a.emergency.coverageMonths.toFixed(1)) : null, wellness: a.wellness.ready ? a.wellness.score : null, weakestArea: a.wellness.weakest ?? null }, note: 'Run the suggested What-ifs in the Intelligence section to see the effect on your own plan.' };
  });
  app.delete('/life-events/:id', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await pool.query('DELETE FROM life_events WHERE id = $1 AND user_id = $2', [id, req.user.id])).rowCount) throw new HttpError(404, 'Not found', 'not_found');
    return { ok: true };
  });

  // ── Co-Pilot (proposes only; you approve and act) ──────────────
  app.post('/copilot/refresh', heavy, async (req) => {
    const today = todayStr(), a = await analysis(req.user, today), e = await estateState(req.user);
    const readiness = estateReadiness({ plan: e.plan, beneficiaries: e.ben, netWorth: e.estateValue, dependents: e.s.profile.dependents ?? 0, today });
    const top = a.s.ctx.positions[0];
    const props = proposeTasks({ wellness: a.wellness, emergency: a.emergency, insurance: a.insurance, loans: a.s.loans, estate: readiness, concentration: top && top.weight > 0.35 ? top : null, diversified: a.s.ctx.health?.total ? (a.s.ctx.health.diversification ?? 100) >= 60 : undefined });
    for (const p of props) await pool.query(`INSERT INTO copilot_tasks (user_id, key, title, detail) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, key) DO UPDATE SET title = $3, detail = $4 WHERE copilot_tasks.status = 'proposed'`, [req.user.id, p.key, p.title, p.detail]);
    await pool.query(`DELETE FROM copilot_tasks WHERE user_id = $1 AND status = 'proposed' AND key <> ALL($2::text[])`, [req.user.id, props.map(p => p.key)]);
    return { proposed: props.length };
  });
  app.get('/copilot', auth, async (req) => ({ tasks: (await pool.query(`SELECT id, key, title, detail, status, created_at, decided_at FROM copilot_tasks WHERE user_id = $1 ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`, [req.user.id])).rows, note: 'The Co-Pilot only proposes. Approving records your decision; FinAura never moves money or changes accounts for you.' }));
  app.post('/copilot/:id/decision', auth, async (req) => {
    const { id } = idParam.parse(req.params);
    const { decision } = z.object({ decision: z.enum(['approve', 'dismiss', 'done']) }).parse(req.body);
    const status = { approve: 'approved', dismiss: 'dismissed', done: 'done' }[decision];
    const r = await pool.query(`UPDATE copilot_tasks SET status = $3, decided_at = now() WHERE id = $1 AND user_id = $2 RETURNING status`, [id, req.user.id, status]);
    if (!r.rowCount) throw new HttpError(404, 'Task not found', 'not_found');
    return { status };
  });

  // ── Fraud awareness, documents, claims ─────────────────────────
  app.get('/fraud', auth, async (req) => {
    const txns = (await pool.query('SELECT day, amount::float AS amount, direction, merchant, description FROM cash_txns WHERE user_id = $1 ORDER BY day DESC LIMIT 1000', [req.user.id])).rows;
    return detectFraudRisk(txns);
  });
  const SCHEMAS = {
    insurance: z.object({ insurer: z.string().nullable(), policyName: z.string().nullable(), kind: z.string().nullable(), sumAssured: z.number().nullable(), annualPremium: z.number().nullable(), startDate: z.string().nullable(), termYears: z.number().nullable(), exclusions: z.array(z.string()).nullable(), waitingPeriods: z.array(z.string()).nullable() }),
    loan: z.object({ lender: z.string().nullable(), principal: z.number().nullable(), interestRate: z.number().nullable(), emi: z.number().nullable(), tenureMonths: z.number().nullable(), processingFee: z.number().nullable(), prepaymentCharges: z.string().nullable() }),
    tax: z.object({ grossIncome: z.number().nullable(), taxDeducted: z.number().nullable(), deductions80C: z.number().nullable(), employer: z.string().nullable(), financialYear: z.string().nullable() }),
    statement: z.object({ institution: z.string().nullable(), periodStart: z.string().nullable(), periodEnd: z.string().nullable(), closingBalance: z.number().nullable(), totalDebits: z.number().nullable(), totalCredits: z.number().nullable() }),
    other: z.object({ summary: z.string().nullable(), keyDates: z.array(z.string()).nullable(), keyAmounts: z.array(z.number()).nullable() }),
  };
  app.post('/documents/analyze', heavy, async (req) => {
    const b = z.object({ kind: z.enum(Object.keys(SCHEMAS)), text: z.string().trim().min(20).max(12000) }).parse(req.body);
    const fields = await app.llm.extract({ userId: req.user.id, kind: `doc_${b.kind}`, instruction: `Extract the ${b.kind} document fields. Amounts as plain numbers in the document currency.`, text: b.text, schema: SCHEMAS[b.kind] });
    return fields ? { llm: true, kind: b.kind, fields, note: 'Extracted by an AI model. Check every value against the original before relying on it.' } : { llm: false, kind: b.kind, fields: null, fallback: regexExtract(b.text) };
  });
  app.get('/claims/checklist/:kind', auth, async (req) => {
    const list = CLAIM_CHECKLIST[req.params.kind]; if (!list) throw new HttpError(404, 'Unknown claim type', 'not_found');
    return { kind: req.params.kind, checklist: list, note: 'A general checklist. Your policy document and insurer decide what is required. For disputes, speak to an insurance adviser or use the insurer’s grievance process.' };
  });
}
