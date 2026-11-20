import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser, client } from './helpers.js';
import { trustScore, classifyNeed, matchExperts, inAvailability, buildBrief } from '../src/engines/connect.js';

describe('connect engines', () => {
  it('trust score shrinks small samples, penalises complaints and explains itself', () => {
    expect(trustScore({ verified: false }).score).toBe(0);
    const fresh = trustScore({ verified: true, ratings: [5], completed: 1 }), many = trustScore({ verified: true, ratings: Array(20).fill(5), completed: 20 });
    expect(many.score).toBeGreaterThan(fresh.score); expect(fresh.components.find(c => c.key === 'ratings').got).toBeLessThan(25);   // one 5-star does not max it out
    const bad = trustScore({ verified: true, ratings: Array(20).fill(5), completed: 20, openComplaints: 2, upheldComplaints: 1 });
    expect(bad.score).toBeLessThan(many.score); expect(bad.explain.risks.length).toBeGreaterThan(0); expect(many.tier).toBe('established');
  });
  it('classifies needs and flags requests for personalised investment advice', () => {
    expect(classifyNeed('I got an income tax notice').categories).toContain('tax');
    expect(classifyNeed('Which mutual fund should I buy?')).toMatchObject({ wantsPersonalAdvice: true });
    expect(classifyNeed('How do I make a will?').categories).toContain('estate'); expect(classifyNeed('hello').categories).toEqual(['general']);
  });
  it('checks availability in IST', () => {
    const avail = [{ day: 1, start: '10:00', end: '12:00' }];   // Monday 10-12 IST
    expect(inAvailability(avail, '2026-11-23T05:00:00Z')).toBe(true);    // Mon 10:30 IST
    expect(inAvailability(avail, '2026-11-23T06:15:00Z')).toBe(false);   // 11:45 IST, 30 min slot would overrun
    expect(inAvailability(avail, '2026-11-24T05:00:00Z')).toBe(false); expect(inAvailability([], '2026-11-23T05:00:00Z')).toBe(false);
  });
  it('matching ranks fit, explains why and warns when capacity cannot give advice', () => {
    const e = (id, over) => ({ id, display_name: id, status: 'verified', category: 'investment', capacity: 'mf_distributor', specialties: [], languages: ['English'], fee: 1000, accepts_nri: false, trust: { score: 60 }, ...over });
    const need = { ...classifyNeed('which mutual fund should I buy for my sip'), text: 'which mutual fund should I buy for my sip' };
    const m = matchExperts({ need, experts: [e('dist'), e('ria', { capacity: 'investment_adviser', specialties: ['sip'] }), e('ca', { category: 'tax', capacity: 'chartered_accountant' }), e('pending', { status: 'pending' })], language: 'English', maxFee: 2000 });
    expect(m.map(x => x.expertId)).toEqual(['ria', 'dist']);   // CA and unverified are excluded
    expect(m[0].reasons.join(' ')).toMatch(/personalised investment advice/); expect(m[1].cautions.join(' ')).toMatch(/may not be able to tell you what to buy/);
  });
  it('briefs contain only shared items and carry an AI notice', () => {
    const b = buildBrief({ consultation: { topic: 'T', question: 'Q', intake: { goal: 'retire' }, kind: 'chat' }, shared: { netWorth: 1500000 } });
    expect(b.lines.join('\n')).toMatch(/1,500,000|15,00,000/); expect(b.lines.join('\n')).not.toMatch(/Wellness/); expect(b.aiNotice).toMatch(/AI-assisted/);
  });
});

let app, pool; const ADMIN = 'admin@finaura.test';
beforeAll(async () => { ({ app, pool } = await setup({ ADMIN_EMAILS: ADMIN })); });
afterAll(async () => { await app.close(); await pool.end(); });

const FUTURE_MONDAY = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 7); d.setUTCHours(5, 0, 0, 0); return d.toISOString(); };   // a Monday 10:30 IST, at least a week out
const profile = over => ({ displayName: 'Dr. Rao', headline: 'Fee-only planner', bio: 'Twenty years helping families plan for retirement and goals.', category: 'investment', capacity: 'investment_adviser', specialties: ['retirement', 'sip'], languages: ['English', 'Hindi'], credentials: 'CFP, MBA Finance', registrationBody: 'SEBI RIA', registrationNumber: 'INA000000000', yearsExperience: 15, fee: 2500, feeModel: 'per_session', feeDisclosure: 'Flat fee per session. No commissions.', conflictsDisclosure: 'I do not sell or earn from any product.', availability: [{ day: 1, start: '10:00', end: '13:00' }], acceptsNri: true, ...over });

async function loginAdmin() { const c = client(app); const r = await c.post('/api/auth/login', { email: ADMIN, password: 'Sup3r-secret-pass' }); expect(r.status).toBe(200); return c; }
describe('Connect: verification, discovery and trust', () => {
  it('requires registration for regulated capacities, hides pending experts, admin verifies', async () => {
    const adm = await newUser(app, { email: ADMIN, name: 'Admin' });
    const e1 = await newUser(app, { name: 'E1' });
    expect((await e1.c.post('/api/connect/expert/apply', profile({ registrationNumber: null }))).status).toBe(400);
    const ap = await e1.c.post('/api/connect/expert/apply', profile()); expect(ap.status).toBe(201);
    expect((await e1.c.post('/api/connect/expert/apply', profile())).status).toBe(409);
    const u = await newUser(app);
    expect((await u.c.get('/api/connect/experts')).body.experts).toHaveLength(0);   // pending is invisible
    expect((await u.c.get(`/api/connect/experts/${ap.body.id}`)).status).toBe(404);
    expect((await u.c.get('/api/connect/admin/experts')).status).toBe(403);
    expect((await adm.c.get('/api/connect/admin/experts')).body.experts).toHaveLength(1);
    expect((await adm.c.post(`/api/connect/admin/experts/${ap.body.id}/decision`, { decision: 'reject' })).status).toBe(400);   // reason required
    expect((await adm.c.post(`/api/connect/admin/experts/${ap.body.id}/decision`, { decision: 'verify' })).body.status).toBe('verified');
    const list = (await u.c.get('/api/connect/experts?category=investment')).body.experts; expect(list).toHaveLength(1); expect(list[0].capacityInfo.personalInvestmentAdvice).toBe(true); expect(list[0].registration).toMatch(/SEBI RIA/);
    // editing credentials sends a verified profile back for review and hides it
    expect((await e1.c.put('/api/connect/expert/me', profile({ credentials: 'CFP, MBA, PhD' }))).body.status).toBe('pending');
    expect((await u.c.get('/api/connect/experts')).body.experts).toHaveLength(0);
    await adm.c.post(`/api/connect/admin/experts/${ap.body.id}/decision`, { decision: 'verify' });
    expect((await u.c.get('/api/connect/experts')).body.experts).toHaveLength(1);
    const m = (await u.c.post('/api/connect/match', { question: 'Which mutual fund should I buy for my SIP?', language: 'Hindi' })).body;
    expect(m.matches[0].expertId).toBe(ap.body.id); expect(m.notice).toMatch(/personalised investment advice/); expect(m.aiNotice).toBeTruthy();
    expect((await adm.c.get('/api/connect/admin/audit')).body.log.map(l => l.action)).toEqual(expect.arrayContaining(['apply', 'verify']));
  });
});

describe('Connect: consultation lifecycle with consent', () => {
  it('books, confirms, shares only what is consented, logs access, revokes, completes, reviews', async () => {
    const adminC = await loginAdmin();
    const ex = await newUser(app, { name: 'Dr Sharma' }), cl = await newUser(app, { name: 'Client' }), stranger = await newUser(app);
    const ap = (await ex.c.post('/api/connect/expert/apply', profile({ fee: 3000, feeModel: 'free_first' }))).body;
    await adminC.post(`/api/connect/admin/experts/${ap.id}/decision`, { decision: 'verify' });
    await cl.c.post('/api/demo'); await cl.c.put('/api/profile', { age: 38, retirementAge: 60, annualIncome: 2500000, monthlyExpenses: 80000 });
    const base = { expertId: ap.id, kind: 'video', topic: 'Retirement plan', question: 'Am I saving enough to retire at 60?', intake: { goal: 'Retire at 60' } };
    expect((await cl.c.post('/api/connect/consultations', { ...base, scheduledFor: new Date(Date.now() - 3600000).toISOString() })).status).toBe(400);   // past
    expect((await cl.c.post('/api/connect/consultations', { ...base, scheduledFor: '2030-01-02T02:00:00Z' })).status).toBe(400);   // outside availability
    expect((await cl.c.post('/api/connect/consultations', { ...base, kind: 'second_opinion', scheduledFor: null })).status).toBe(400);   // needs the advice text
    const when = FUTURE_MONDAY();
    const bk = await cl.c.post('/api/connect/consultations', { ...base, scheduledFor: when }); expect(bk.status).toBe(201);
    expect(bk.body.consultation.fee).toBe(0); expect(bk.body.consultation.paymentStatus).toBe('waived');   // first session free
    expect(bk.body.disclosure.conflicts).toMatch(/do not sell/);
    const cid = bk.body.consultation.id;
    const second = await cl.c.post('/api/connect/consultations', { ...base, scheduledFor: when }); expect(second.body.consultation.fee).toBe(3000);
    // before any share the expert sees nothing financial
    const b0 = (await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body; expect(b0.shared).toEqual({}); expect(b0.note).toMatch(/not shared/);
    expect((await stranger.c.get(`/api/connect/expert/consultations/${cid}/brief`)).status).toBe(404);
    expect((await stranger.c.get(`/api/connect/consultations/${cid}`)).status).toBe(404);
    expect((await ex.c.post(`/api/connect/consultations/${cid}/share`, { scope: { netWorth: true } })).status).toBe(403);   // expert cannot grant on the client’s behalf
    expect((await cl.c.post(`/api/connect/consultations/${cid}/share`, { scope: {} })).status).toBe(400);
    expect((await cl.c.post(`/api/connect/consultations/${cid}/share`, { scope: { netWorth: true, wellness: true } })).status).toBe(200);
    const b1 = (await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body;
    expect(b1.shared.netWorth).toBeGreaterThan(0); expect(b1.shared.wellness).toBeTruthy(); expect(b1.shared.allocation).toBeUndefined(); expect(b1.shared.behaviour).toBeUndefined();
    expect(b1.brief.aiNotice).toMatch(/AI-assisted/); expect(b1.brief.lines.join('\n')).toMatch(/Net worth/);
    expect((await cl.c.get(`/api/connect/consultations/${cid}/share/log`)).body.log.length).toBe(1);   // the one brief read after sharing is logged; the earlier one saw nothing
    expect((await ex.c.post(`/api/connect/expert/consultations/${cid}/respond`, { decision: 'confirm', meetingLink: 'https://meet.example.com/abc' })).body.status).toBe('confirmed');
    expect((await ex.c.post(`/api/connect/expert/consultations/${cid}/respond`, { decision: 'confirm' })).status).toBe(409);
    // documents are separate consent
    await cl.c.post(`/api/connect/consultations/${cid}/documents`, { title: 'Policy', kind: 'insurance', text: 'Term plan sum assured 1 crore' });
    expect((await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared.documents).toBeUndefined();
    await cl.c.post(`/api/connect/consultations/${cid}/share`, { scope: { documents: true } });
    expect((await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared.documents).toHaveLength(1);
    expect((await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared.netWorth).toBeUndefined();   // re-sharing replaced the scope
    // messages with labels
    await cl.c.post(`/api/connect/consultations/${cid}/messages`, { body: 'Hello doctor' }); await ex.c.post(`/api/connect/consultations/${cid}/messages`, { body: 'Hi, let us begin' });
    const msgs = (await cl.c.get(`/api/connect/consultations/${cid}/messages`)).body.messages; expect(msgs.map(m => m.label)).toEqual(['Client', 'Verified expert']);
    expect((await stranger.c.post(`/api/connect/consultations/${cid}/messages`, { body: 'hi' })).status).toBe(404);
    expect((await cl.c.post(`/api/connect/consultations/${cid}/ai-summary`)).body.summary).toBeNull();   // no LLM key configured
    // revoke cuts access immediately
    expect((await cl.c.post(`/api/connect/consultations/${cid}/share/revoke`)).body.revoked).toBe(1);
    expect((await ex.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared).toEqual({});
    // completion, actions, review
    expect((await cl.c.post(`/api/connect/consultations/${cid}/review`, { rating: 5 })).status).toBe(409);   // not completed yet
    expect((await ex.c.post(`/api/connect/expert/consultations/${cid}/complete`)).body.status).toBe('completed');
    const act = await ex.c.post(`/api/connect/expert/consultations/${cid}/actions`, { text: 'Increase SIP by 5,000', dueOn: '2026-12-31' }); expect(act.status).toBe(201);
    const mine = (await cl.c.get('/api/connect/actions')).body.actions; expect(mine[0].text).toMatch(/SIP/); expect((await cl.c.patch(`/api/connect/actions/${mine[0].id}`, { status: 'done' })).body.status).toBe('done');
    expect((await stranger.c.patch(`/api/connect/actions/${mine[0].id}`, { status: 'done' })).status).toBe(404);
    expect((await cl.c.post(`/api/connect/consultations/${cid}/review`, { rating: 5, text: 'Clear and honest' })).status).toBe(201);
    expect((await cl.c.post(`/api/connect/consultations/${cid}/review`, { rating: 1 })).status).toBe(409);
    expect((await stranger.c.post(`/api/connect/consultations/${cid}/review`, { rating: 1 })).status).toBe(404);
    // expert workspace and private notes
    await ex.c.post('/api/connect/expert/notes', { consultationId: cid, note: 'Client risk-averse' });
    const ws = (await ex.c.get('/api/connect/expert/workspace')).body; expect(ws.completed).toBe(1); expect(ws.clients[0].name).toBe('Client'); expect(ws.openFollowUps).toBe(0); expect(ws.pending).toHaveLength(1);
    expect((await cl.c.get(`/api/connect/expert/notes?consultationId=${cid}`)).status).toBe(403);   // clients are not experts
    const detail = (await cl.c.get(`/api/connect/experts/${ap.id}`)).body; expect(detail.reviews).toHaveLength(1); expect(detail.trust.score).toBeGreaterThan(0);
  });

  it('rooms, second opinions, complaints, suspension, academy and community', async () => {
    const adminC = await loginAdmin();
    const e1 = await newUser(app, { name: 'Lead' }), e2 = await newUser(app, { name: 'Tax CA' }), cl = await newUser(app, { name: 'Cl2' });
    const a1 = (await e1.c.post('/api/connect/expert/apply', profile())).body, a2 = (await e2.c.post('/api/connect/expert/apply', profile({ displayName: 'CA Mehta', category: 'tax', capacity: 'chartered_accountant', registrationBody: 'ICAI', registrationNumber: '123456', fee: 1500 }))).body;
    for (const id of [a1.id, a2.id]) await adminC.post(`/api/connect/admin/experts/${id}/decision`, { decision: 'verify' });
    const so = await cl.c.post('/api/connect/consultations', { expertId: a1.id, kind: 'second_opinion', topic: 'Review advice', question: 'Is this advice sound?', originalAdvice: 'Put 80% in one small-cap fund', scheduledFor: null });
    expect(so.status).toBe(201); const cid = so.body.consultation.id;
    expect((await e1.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.brief.lines.join('\n')).toMatch(/small-cap/);
    const inv = await cl.c.post(`/api/connect/consultations/${cid}/invite-expert`, { expertId: a2.id }); expect(inv.status).toBe(201);
    expect((await cl.c.post(`/api/connect/consultations/${cid}/invite-expert`, { expertId: a2.id })).status).toBe(409);
    expect((await e2.c.get(`/api/connect/consultations/${cid}`)).status).toBe(404);   // not joined yet
    expect((await e2.c.get('/api/connect/expert/room-invites')).body.invites).toHaveLength(1);
    expect((await e2.c.post(`/api/connect/expert/room-invites/${inv.body.id}/respond`, { accept: true })).body.status).toBe('joined');
    expect((await e2.c.post(`/api/connect/consultations/${cid}/messages`, { body: 'Tax angle: LTCG applies' })).status).toBe(201);
    expect((await e2.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared).toEqual({});   // joined but nothing shared with them
    expect((await cl.c.post(`/api/connect/consultations/${cid}/share`, { scope: { netWorth: true }, expertId: a2.id })).status).toBe(200);
    expect((await e2.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared.netWorth).toBeDefined();
    expect((await e1.c.get(`/api/connect/expert/consultations/${cid}/brief`)).body.shared).toEqual({});   // lead was not given the share
    expect((await e2.c.post(`/api/connect/consultations/${cid}/cancel`)).status).toBe(403);
    // complaints, suspension
    expect((await newUser(app).then(u => u.c.post('/api/connect/complaints', { expertId: a1.id, body: 'I never booked but complaining' }))).status).toBe(403);
    const cp = await cl.c.post('/api/connect/complaints', { expertId: a1.id, consultationId: cid, body: 'Advice was pushy about a specific product.' }); expect(cp.status).toBe(201);
    expect((await adminC.get('/api/connect/admin/complaints')).body.complaints).toHaveLength(1);
    expect((await adminC.post(`/api/connect/admin/complaints/${cp.body.id}/resolve`, { outcome: 'upheld', resolution: 'Warned and noted on record' })).status).toBe(200);
    expect((await adminC.post(`/api/connect/admin/experts/${a1.id}/decision`, { decision: 'suspend', reason: 'Repeated conduct issues' })).body.status).toBe('suspended');
    expect((await cl.c.get(`/api/connect/consultations/${cid}`)).body.consultation.status).toBe('cancelled');
    expect((await cl.c.get('/api/connect/experts')).body.experts.map(e => e.id)).not.toContain(a1.id);
    // academy + community
    expect((await cl.c.post('/api/connect/expert/academy', { title: 'x', kind: 'webinar', description: 'A good webinar about tax' })).status).toBe(403);
    const ac = await e2.c.post('/api/connect/expert/academy', { title: 'ITR basics', kind: 'webinar', description: 'How to file your return and pick a regime.', fee: 0 }); expect(ac.status).toBe(201);
    expect((await cl.c.post(`/api/connect/academy/${ac.body.id}/enroll`)).status).toBe(200); expect((await cl.c.post(`/api/connect/academy/${ac.body.id}/enroll`)).status).toBe(200);
    const items = (await cl.c.get('/api/connect/academy')).body.items; expect(items[0].enrolled).toBe(1); expect(items[0].enrolledByMe).toBe(true);
    const q = await cl.c.post('/api/connect/community', { title: 'Which tax regime for 15 lakh income?', body: 'Salaried, 80C maxed.', category: 'tax' }); expect(q.status).toBe(201);
    expect((await cl.c.post(`/api/connect/community/${q.body.id}/answers`, { body: 'Users cannot answer as experts here.' })).status).toBe(403);
    expect((await e2.c.post(`/api/connect/community/${q.body.id}/answers`, { body: 'Compare both regimes with your actual deductions.' })).status).toBe(201);
    const page = (await cl.c.get(`/api/connect/community/${q.body.id}`)).body; expect(page.question.askedBy).toBe('Anonymous'); expect(page.answers[0].capacityLabel).toBe('Chartered accountant');
    expect((await adminC.post(`/api/connect/admin/community/${q.body.id}/hide`)).status).toBe(200); expect((await cl.c.get(`/api/connect/community/${q.body.id}`)).status).toBe(404);
  });
});
