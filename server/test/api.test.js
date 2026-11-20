import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser, client, H } from './helpers.js';
import { sha256 } from '../src/lib/security.js';
import { addDays, todayStr } from '../src/lib/dates.js';

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

describe('security basics', () => {
  it('health check hits the database', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('ok');
  });
  it('sets security headers', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
  });
  it('rejects state-changing requests without the CSRF header', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(r.statusCode).toBe(403);
  });
  it('requires auth for private routes', async () => {
    const c = client(app);
    for (const u of ['/api/me', '/api/portfolio', '/api/behavior', '/api/goals', '/api/twin']) expect((await c.get(u)).status).toBe(401);
  });
  it('404s unknown API routes as JSON', async () => {
    const r = await client(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('not_found');
  });
});

describe('auth', () => {
  it('registers, sets an httpOnly cookie, and never stores the plaintext password', async () => {
    const { c, email, res } = await newUser(app);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.onboarded).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const setCookie = (await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: JSON.stringify({ email, password: 'Sup3r-secret-pass' }) })).headers['set-cookie'];
    expect(String(setCookie)).toMatch(/HttpOnly/i);
    expect(String(setCookie)).toMatch(/SameSite=Lax/i);
    const row = (await pool.query('SELECT password_hash FROM users WHERE email = $1', [email])).rows[0];
    expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
    const me = await c.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
  it('stores only a hash of the session token', async () => {
    const { c } = await newUser(app);
    const token = decodeURIComponent(c.cookie().split('=')[1]);
    const hit = await pool.query('SELECT 1 FROM sessions WHERE token_hash = $1', [sha256(token)]);
    expect(hit.rowCount).toBe(1);
    expect((await pool.query('SELECT 1 FROM sessions WHERE token_hash = $1', [token])).rowCount).toBe(0);
  });
  it('validates input', async () => {
    const c = client(app);
    expect((await c.post('/api/auth/register', { email: 'bad', password: 'short', name: '', acceptTerms: true })).status).toBe(400);
    expect((await c.post('/api/auth/register', { email: 'a@example.com', password: 'Sup3r-secret-pass', name: 'A', acceptTerms: false })).status).toBe(400);
  });
  it('rejects duplicate emails (case-insensitive)', async () => {
    const { email } = await newUser(app);
    const r = await client(app).post('/api/auth/register', { email: email.toUpperCase(), password: 'Sup3r-secret-pass', name: 'Dup', acceptTerms: true });
    expect(r.status).toBe(409);
  });
  it('logs in, logs out, and invalidates the session', async () => {
    const { email } = await newUser(app);
    const c = client(app);
    expect((await c.post('/api/auth/login', { email, password: 'wrong-password-1' })).status).toBe(401);
    expect((await c.post('/api/auth/login', { email, password: 'Sup3r-secret-pass' })).status).toBe(200);
    expect((await c.get('/api/me')).status).toBe(200);
    const oldCookie = c.cookie();
    await c.post('/api/auth/logout');
    const r = await app.inject({ method: 'GET', url: '/api/me', headers: { ...H, cookie: oldCookie } });
    expect(r.statusCode).toBe(401);
  });
  it('locks the account after repeated failures', async () => {
    const { email } = await newUser(app);
    const c = client(app);
    // rate limiter allows 10/min on auth routes; stay under it
    for (let i = 0; i < 8; i++) await c.post('/api/auth/login', { email, password: `wrong-password-${i}` });
    const r = await c.post('/api/auth/login', { email, password: 'Sup3r-secret-pass' });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('locked');
  });
  it('rate-limits auth endpoints', async () => {
    const c = client(app);
    let limited = false;
    for (let i = 0; i < 25; i++) { const r = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever-pass-1' }); if (r.status === 429) { limited = true; break; } }
    expect(limited).toBe(true);
  });
  it('handles password reset end-to-end and signs out other sessions', async () => {
    const { c, email } = await newUser(app);
    const anon = client(app);
    const logs = [];
    const orig = app.mailer.send;
    app.mailer.send = async m => { logs.push(m); return { logged: true }; };
    // unknown email gives the same response
    expect((await anon.post('/api/auth/password-reset/request', { email: 'ghost@example.com' })).body).toEqual({ ok: true });
    expect((await anon.post('/api/auth/password-reset/request', { email })).body).toEqual({ ok: true });
    app.mailer.send = orig;
    const token = logs.at(-1).text.match(/token=([\w-]+)/)[1];
    expect((await anon.post('/api/auth/password-reset/confirm', { token: 'x'.repeat(40), password: 'Another-pass-123' })).status).toBe(400);
    expect((await anon.post('/api/auth/password-reset/confirm', { token, password: 'Another-pass-123' })).status).toBe(200);
    expect((await anon.post('/api/auth/password-reset/confirm', { token, password: 'Third-pass-12345' })).status).toBe(400); // single use
    expect((await c.get('/api/me')).status).toBe(401);
    expect((await client(app).post('/api/auth/login', { email, password: 'Another-pass-123' })).status).toBe(200);
  });
  it('verifies email with a single-use token', async () => {
    const { c, email } = await newUser(app);
    const user = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
    const raw = 'verify-token-for-test-1234567890';
    await pool.query(`INSERT INTO email_tokens (user_id, kind, token_hash, expires_at) VALUES ($1,'verify',$2, now() + interval '1 day')`, [user.id, sha256(raw)]);
    expect((await c.post('/api/auth/verify', { token: raw })).status).toBe(200);
    expect((await c.get('/api/me')).body.user.emailVerified).toBe(true);
    expect((await c.post('/api/auth/verify', { token: raw })).status).toBe(400);
  });
  it('computes the risk profile server-side from quiz answers', async () => {
    const { c } = await newUser(app);
    expect((await c.post('/api/me/onboarding', { answers: [1, 1, 2, 2] })).body.profile).toBe('Conservative');
    expect((await c.post('/api/me/onboarding', { answers: [3, 3, 3, 3] })).body.profile).toBe('Moderate');
    const r = await c.post('/api/me/onboarding', { answers: [4, 4, 4, 4] });
    expect(r.body.profile).toBe('Aggressive');
    expect(r.body.user.onboarded).toBe(true);
    expect((await c.post('/api/me/onboarding', { answers: [9, 1, 1, 1] })).status).toBe(400);
  });
  it('updates settings and enforces handle rules', async () => {
    const { c } = await newUser(app);
    expect((await c.patch('/api/me', { name: 'New Name', currency: 'USD' })).body.user.name).toBe('New Name');
    expect((await c.patch('/api/me', { handle: 'Bad Handle!' })).status).toBe(400);
    expect((await c.patch('/api/me', { leaderboardOptIn: true })).status).toBe(400); // handle required
    expect((await c.patch('/api/me', { handle: 'zed_trader', leaderboardOptIn: true })).status).toBe(200);
    const other = await newUser(app);
    expect((await other.c.patch('/api/me', { handle: 'ZED_TRADER' })).status).toBe(400); // pattern is lowercase
    expect((await other.c.patch('/api/me', { handle: 'zed_trader' })).status).toBe(409);
    expect((await c.patch('/api/me', { xp: 9999 })).status).toBe(400); // strict schema: no mass assignment
  });
  it('changes password and requires the current one', async () => {
    const { c, email } = await newUser(app);
    expect((await c.post('/api/me/password', { current: 'nope-nope-nope', next: 'Brand-new-pass-1' })).status).toBe(403);
    expect((await c.post('/api/me/password', { current: 'Sup3r-secret-pass', next: 'Brand-new-pass-1' })).status).toBe(200);
    expect((await client(app).post('/api/auth/login', { email, password: 'Brand-new-pass-1' })).status).toBe(200);
  });
});

describe('portfolio', () => {
  it('starts empty, validates trades and tracks positions', async () => {
    const { c } = await newUser(app);
    const empty = await c.get('/api/portfolio');
    expect(empty.body.empty).toBe(true);
    const day = addDays(todayStr(), -30);
    // unknown symbol needs metadata
    const unk = await c.post('/api/transactions', { symbol: 'zzz', side: 'buy', quantity: 10, price: 100, date: day });
    expect(unk.status).toBe(422);
    expect(unk.body.code).toBe('unknown_asset');
    const ok = await c.post('/api/transactions', { symbol: 'zzz', side: 'buy', quantity: 10, price: 100, date: day, name: 'Zed Corp', assetClass: 'equity' });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.symbol).toBe('ZZZ');
    expect(ok.body.xpAwarded).toBeGreaterThan(0);
    expect(ok.body.unlocked.map(u => u.key)).toContain('first_trade');
    expect((await c.post('/api/transactions', { symbol: 'ZZZ', side: 'sell', quantity: 11, price: 100, date: day })).body.code).toBe('oversell');
    expect((await c.post('/api/transactions', { symbol: 'ZZZ', side: 'buy', quantity: 1, price: 1, date: addDays(todayStr(), 3) })).body.code).toBe('future_date');
    expect((await c.post('/api/transactions', { symbol: 'ZZZ', side: 'buy', quantity: -1, price: 1, date: day })).status).toBe(400);
    const p = await c.get('/api/portfolio');
    expect(p.body.positions).toHaveLength(1);
    expect(p.body.positions[0].quantity).toBe(10);
    expect(p.body.dataQuality).toBe('approx');
  });
  it('lets you delete a trade only if the ledger stays valid', async () => {
    const { c } = await newUser(app);
    const d1 = addDays(todayStr(), -20), d2 = addDays(todayStr(), -10);
    const buy = await c.post('/api/transactions', { symbol: 'QQQX', side: 'buy', quantity: 5, price: 10, date: d1, name: 'Q', assetClass: 'equity' });
    await c.post('/api/transactions', { symbol: 'QQQX', side: 'sell', quantity: 5, price: 12, date: d2 });
    expect((await c.del(`/api/transactions/${buy.body.transaction.id}`)).status).toBe(422);
    const list = (await c.get('/api/transactions')).body;
    expect(list.total).toBe(2);
  });
  it('imports CSV atomically and reports row errors', async () => {
    const { c } = await newUser(app);
    const d = n => addDays(todayStr(), -n);
    const good = `date,symbol,side,quantity,price,name,class\n${d(60)},IMPA,buy,10,100,Import A,equity\n${d(50)},IMPB,buy,2,5000,Import B,crypto\n${d(40)},IMPA,sell,3,110,,`;
    const r = await c.post('/api/transactions/import', { csv: good });
    expect(r.status).toBe(200);
    expect(r.body.imported).toBe(3);
    expect(r.body.newAssets.sort()).toEqual(['IMPA', 'IMPB']);
    const bad = `date,symbol,side,quantity,price\n${d(10)},IMPA,buy,1,1\nnot-a-date,IMPA,buy,1,1`;
    const e = await c.post('/api/transactions/import', { csv: bad });
    expect(e.status).toBe(422);
    expect(e.body.details[0].row).toBe(3);
    expect((await c.get('/api/transactions')).body.total).toBe(3); // nothing from the bad file was saved
    const over = `date,symbol,side,quantity,price\n${d(5)},IMPA,sell,100,1`;
    expect((await c.post('/api/transactions/import', { csv: over })).body.code).toBe('oversell');
  });
  it('isolates users from each other', async () => {
    const a = await newUser(app), b = await newUser(app);
    await a.c.post('/api/demo');
    const mine = (await a.c.get('/api/transactions')).body;
    const theirs = (await b.c.get('/api/transactions')).body;
    expect(mine.total).toBeGreaterThan(10);
    expect(theirs.total).toBe(0);
    const id = mine.transactions[0].id;
    expect((await b.c.del(`/api/transactions/${id}`)).status).toBe(404);
  });
  it('loads demo data once and builds a full portfolio view', async () => {
    const { c } = await newUser(app);
    const r = await c.post('/api/demo');
    expect(r.status).toBe(201);
    expect((await c.post('/api/demo')).status).toBe(409);
    const p = (await c.get('/api/portfolio')).body;
    expect(p.positions.length).toBeGreaterThanOrEqual(4);
    expect(p.dataQuality).toBe('market');
    expect(p.health.total).toBeGreaterThan(0);
    expect(p.history.length).toBeGreaterThan(6);
    const w = p.positions.reduce((s, x) => s + x.weight, 0);
    expect(w).toBeCloseTo(1, 6);
  });
  it('searches assets safely (LIKE wildcards are escaped)', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    expect((await c.get('/api/assets?q=demo_b')).body.assets.map(a => a.symbol)).toContain('DEMO_BTC');
    expect((await c.get('/api/assets?q=%25')).body.assets).toHaveLength(0);
  });
  it('refuses price refresh when no provider is configured', async () => {
    const { c } = await newUser(app);
    expect((await c.post('/api/prices/refresh')).status).toBe(501);
  });
});

describe('insights on the demo portfolio', () => {
  let c;
  beforeAll(async () => { ({ c } = await newUser(app)); await c.post('/api/demo'); await c.post('/api/me/onboarding', { answers: [3, 3, 3, 3] }); });

  it('behavioural analysis finds the planted mistakes and a negative alpha', async () => {
    const b = (await c.get('/api/behavior')).body;
    expect(b.status).toBe('ok');
    expect(b.evidence.panicSells).toBeGreaterThanOrEqual(1);
    expect(b.alpha.sellCount).toBeGreaterThanOrEqual(2);
    expect(b.alpha.amount).toBeLessThan(0);
    expect(b.patterns.some(p => p.key === 'panic_selling')).toBe(true);
    expect(b.events.every(e => e.id && e.tag)).toBe(true);
  });

  it('empty portfolios get insufficient_data, not an error', async () => {
    const e = await newUser(app);
    const b = (await e.c.get('/api/behavior')).body;
    expect(b.status).toBe('insufficient_data');
    expect((await e.c.post('/api/council', { question: 'rebalance?' })).status).toBe(422);
    expect((await e.c.get('/api/twin')).status).toBe(422);
  });

  it('pre-mortem: stores a nudge, resolves it once, and awards XP for pausing', async () => {
    const hold = (await c.get('/api/portfolio')).body.positions.find(p => p.symbol === 'DEMO_BTC');
    const pm = await c.post('/api/premortem', { symbol: 'DEMO_BTC', side: 'sell', quantity: hold.quantity * 0.5 });
    expect(pm.status).toBe(200);
    expect(['low', 'medium', 'high']).toContain(pm.body.riskLevel);
    expect(pm.body.checklist.length).toBeGreaterThanOrEqual(3);
    expect(pm.body.disclaimer).toBeTruthy();
    const resolve = await c.post(`/api/nudges/${pm.body.id}/resolve`, { decision: 'waited' });
    expect(resolve.status).toBe(200);
    expect((await c.post(`/api/nudges/${pm.body.id}/resolve`, { decision: 'proceeded' })).status).toBe(409);
    const list = (await c.get('/api/nudges')).body;
    expect(list.nudges.find(n => n.id === pm.body.id).decision).toBe('waited');
    expect(typeof list.summary.netOutcome).toBe('number');
  });
  it('pre-mortem rejects overselling and unknown symbols', async () => {
    expect((await c.post('/api/premortem', { symbol: 'DEMO_BTC', side: 'sell', quantity: 1e9 })).status).toBe(422);
    expect((await c.post('/api/premortem', { symbol: 'NOPE', side: 'buy', quantity: 1 })).status).toBe(404);
  });
  it("can't resolve another user's nudge", async () => {
    const hold = (await c.get('/api/portfolio')).body.positions[0];
    const pm = await c.post('/api/premortem', { symbol: hold.symbol, side: 'sell', quantity: hold.quantity * 0.1 });
    const other = await newUser(app);
    expect((await other.c.post(`/api/nudges/${pm.body.id}/resolve`, { decision: 'cancelled' })).status).toBe(404);
  });
  it('logging a trade from a nudge marks the nudge proceeded', async () => {
    const hold = (await c.get('/api/portfolio')).body.positions.find(p => p.symbol === 'DEMO_INDEX');
    const pm = await c.post('/api/premortem', { symbol: 'DEMO_INDEX', side: 'sell', quantity: hold.quantity * 0.1 });
    const r = await c.post('/api/transactions', { symbol: 'DEMO_INDEX', side: 'sell', quantity: hold.quantity * 0.1, price: pm.body.context.price, date: todayStr(), nudgeId: pm.body.id });
    expect(r.status).toBe(201);
    const n = (await c.get('/api/nudges')).body.nudges.find(x => x.id === pm.body.id);
    expect(n.decision).toBe('proceeded');
  });

  it('council: four agents, dissent surfaced, persisted', async () => {
    const r = await c.post('/api/council', { question: 'Should I sell DEMO_BTC?' });
    expect(r.status).toBe(200);
    expect(r.body.agents).toHaveLength(4);
    expect(r.body.topic).toEqual({ action: 'sell', symbol: 'DEMO_BTC' });
    expect(r.body.moderator.summary.length).toBeGreaterThan(10);
    const hist = (await c.get('/api/council')).body.sessions;
    expect(hist.length).toBeGreaterThanOrEqual(1);
  });
  it('council with no question defaults to rebalancing and validates length', async () => {
    expect((await c.post('/api/council', {})).body.topic.action).toBe('rebalance');
    expect((await c.post('/api/council', { question: 'x'.repeat(301) })).status).toBe(400);
  });

  it('twin: returns bands for both paths and a cost of habits', async () => {
    const r = await c.get('/api/twin?scenario=crash&years=8');
    expect(r.status).toBe(200);
    expect(r.body.habit.bands.length).toBeGreaterThan(10);
    expect(r.body.disciplined.bands.at(-1).p90).toBeGreaterThanOrEqual(r.body.disciplined.bands.at(-1).p10);
    expect(typeof r.body.costOfHabits).toBe('number');
    expect(r.body.scenarios.length).toBe(4);
    const again = (await c.get('/api/twin?scenario=crash&years=8')).body;
    expect(again.habit.finalMedian).toBe(r.body.habit.finalMedian); // deterministic per user
    expect((await c.get('/api/twin?scenario=bogus')).status).toBe(400);
    expect((await c.get('/api/twin?years=99')).status).toBe(400);
  });

  it('goals: CRUD, projections and XP', async () => {
    const future = addDays(todayStr(), 365 * 5);
    const created = await c.post('/api/goals', { name: 'House', targetAmount: 2_000_000, targetDate: future, monthlyContribution: 15000 });
    expect(created.status).toBe(201);
    expect((await c.post('/api/goals', { name: 'Past', targetAmount: 1, targetDate: '2020-01-01' })).status).toBe(422);
    const list = (await c.get('/api/goals')).body.goals;
    expect(list[0].projected).toBeGreaterThan(0);
    expect(['on_track', 'close', 'behind']).toContain(list[0].status);
    expect((await c.patch(`/api/goals/${created.body.id}`, { name: 'Dream House' })).status).toBe(200);
    expect((await c.get('/api/goals')).body.goals[0].name).toBe('Dream House');
    expect((await c.get('/api/goals')).body.goals[0].monthlyContribution).toBe(15000); // PATCH must not reset omitted fields
    expect((await c.del(`/api/goals/${created.body.id}`)).status).toBe(200);
    expect((await c.del(`/api/goals/${created.body.id}`)).status).toBe(404);
  });

  it('gamification: XP is idempotent and achievements unlock', async () => {
    const g1 = (await c.get('/api/gamification')).body;
    expect(g1.xp).toBeGreaterThan(0);
    await c.get('/api/me'); await c.get('/api/me'); // same-day check-ins don't double-award
    const g2 = (await c.get('/api/gamification')).body;
    expect(g2.xp - g1.xp).toBeLessThanOrEqual(10);
    expect(g2.achievements.find(a => a.key === 'first_trade').unlocked).toBe(true);
    const dup = await pool.query('SELECT user_id, kind, ref, count(*) FROM xp_events GROUP BY 1,2,3 HAVING count(*) > 1');
    expect(dup.rowCount).toBe(0);
  });

  it('leaderboard only shows opted-in users, by handle', async () => {
    const a = await newUser(app);
    await a.c.patch('/api/me', { handle: 'lb_visible', leaderboardOptIn: true });
    const hidden = await newUser(app);
    await hidden.c.patch('/api/me', { name: 'Secret Name' });
    const lb = (await a.c.get('/api/leaderboard')).body;
    expect(lb.leaders.some(l => l.handle === 'lb_visible' && l.isYou)).toBe(true);
    expect(JSON.stringify(lb)).not.toMatch(/Secret Name|@example/);
    expect(lb.you).toBeGreaterThanOrEqual(1);
  });
});

describe('privacy (DPDP)', () => {
  it('exports all of a users data', async () => {
    const { c } = await newUser(app);
    await c.post('/api/demo');
    await c.post('/api/goals', { name: 'G', targetAmount: 1000, targetDate: addDays(todayStr(), 400) });
    const r = await c.get('/api/me/export');
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('attachment');
    expect(r.body.transactions.length).toBeGreaterThan(10);
    expect(r.body.goals).toHaveLength(1);
    expect(r.body.consents[0].purpose).toBe('terms_privacy');
    expect(JSON.stringify(r.body)).not.toMatch(/password_hash|\$2[aby]\$/);
  });
  it('deletes the account and all personal data, keeping an anonymised audit trail', async () => {
    const { c, email } = await newUser(app);
    await c.post('/api/demo');
    const id = (await pool.query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
    expect((await c.del('/api/me', { password: 'wrong-password-1' })).status).toBe(403);
    expect((await c.del('/api/me', { password: 'Sup3r-secret-pass' })).status).toBe(200);
    for (const t of ['users', 'transactions', 'sessions', 'goals', 'nudges', 'xp_events', 'consents']) {
      const col = t === 'users' ? 'id' : 'user_id';
      expect((await pool.query(`SELECT 1 FROM ${t} WHERE ${col} = $1`, [id])).rowCount).toBe(0);
    }
    const audit = await pool.query(`SELECT user_id, meta FROM audit_log WHERE action = 'account_deleted' ORDER BY id DESC LIMIT 1`);
    expect(audit.rows[0].user_id).toBeNull();
    expect(JSON.stringify(audit.rows[0].meta)).not.toContain(email);
    expect((await client(app).post('/api/auth/login', { email, password: 'Sup3r-secret-pass' })).status).toBe(401);
  });
  it('records consent changes', async () => {
    const { c } = await newUser(app);
    await c.patch('/api/me', { handle: 'consent_user', leaderboardOptIn: true });
    await c.patch('/api/me', { leaderboardOptIn: false });
    const r = (await c.get('/api/me/consents')).body.consents;
    expect(r.find(x => x.purpose === 'leaderboard').granted).toBe(false);
  });
});
