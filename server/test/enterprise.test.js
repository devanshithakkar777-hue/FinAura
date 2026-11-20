import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setup, newUser, H } from './helpers.js';

let app, pool;
beforeAll(async () => { ({ app, pool } = await setup()); });
afterAll(async () => { await app.close(); await pool.end(); });

const v1 = (method, url, key, body) => app.inject({ method, url, remoteAddress: '10.9.9.9', headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) }, payload: body ? JSON.stringify(body) : undefined });

describe('advisor workspace with consented clients', () => {
  it('only shares what the client grants, logs access, and stops on revoke', async () => {
    const adv = await newUser(app, { name: 'Adv' }), cl = await newUser(app, { name: 'Client' }), other = await newUser(app);
    await cl.c.post('/api/demo'); await cl.c.put('/api/profile', { age: 34, retirementAge: 60, annualIncome: 1800000, monthlyExpenses: 60000 });
    expect((await adv.c.post('/api/org/clients/invite', { email: cl.email, scope: { netWorth: true } })).status).toBe(403);   // no workspace yet
    const org = await adv.c.post('/api/org', { name: 'Acme Advisory', brandName: 'Acme Wealth', primaryColor: '#112233', disclaimer: 'Educational only.' });
    expect(org.status).toBe(201); expect((await adv.c.post('/api/org', { name: 'x' })).status).toBe(409);
    expect((await adv.c.put('/api/org', { name: 'Acme Advisory', primaryColor: 'red' })).status).toBe(400);
    expect((await adv.c.post('/api/org/clients/invite', { email: cl.email, scope: {} })).status).toBe(400);
    const inv = await adv.c.post('/api/org/clients/invite', { email: cl.email, scope: { netWorth: true, wellness: true, behaviour: true } });
    expect(inv.status).toBe(201); expect((await adv.c.post('/api/org/clients/invite', { email: cl.email, scope: { netWorth: true } })).status).toBe(409);
    expect((await adv.c.get('/api/org/dashboard')).body.clients).toHaveLength(0);   // invited, not consented
    const mine = (await cl.c.get('/api/me/advisors')).body.advisors; expect(mine[0].brandName).toBe('Acme Wealth');
    expect((await other.c.post(`/api/me/advisors/${mine[0].id}/accept`, { scope: { netWorth: true } })).status).toBe(404);
    expect((await cl.c.post(`/api/me/advisors/${mine[0].id}/accept`, { scope: { allocation: true } })).status).toBe(400);   // not requested
    const acc = await cl.c.post(`/api/me/advisors/${mine[0].id}/accept`, { scope: { netWorth: true, wellness: true, behaviour: true, plan: true } });
    expect(acc.body.scope).toMatchObject({ netWorth: true, wellness: true, behaviour: true, plan: false });   // 'plan' was never requested
    const d = (await adv.c.get('/api/org/dashboard')).body, c0 = d.clients[0];
    expect(c0.netWorth).toBeGreaterThan(0); expect(c0.wellness.score).toBeGreaterThanOrEqual(0); expect(c0.allocation).toBeUndefined(); expect(c0.plan).toBeUndefined(); expect(d.aggregate.activeClients).toBe(1);
    expect((await cl.c.get(`/api/me/advisors/${mine[0].id}/access-log`)).body.log.length).toBe(1);
    expect((await cl.c.put(`/api/me/advisors/${mine[0].id}/scope`, { scope: { netWorth: true } })).body.scope.wellness).toBe(false);
    expect((await adv.c.get('/api/org/dashboard')).body.clients[0].wellness).toBeUndefined();   // narrowed immediately
    expect((await cl.c.post(`/api/me/advisors/${mine[0].id}/revoke`)).status).toBe(200);
    expect((await adv.c.get('/api/org/dashboard')).body.clients).toHaveLength(0);
    expect((await adv.c.get('/api/org/clients')).body.clients[0].status).toBe('revoked');
    expect((await app.inject({ method: 'GET', url: `/api/branding/${org.body.org.id}` })).json().brandName).toBe('Acme Wealth');
  });
});

describe('API keys and stateless v1 API', () => {
  it('issues hashed keys, authenticates, validates and revokes', async () => {
    const { c } = await newUser(app);
    await c.post('/api/org', { name: 'API Co' });
    const k = await c.post('/api/org/api-keys', { name: 'prod' }); expect(k.status).toBe(201); expect(k.body.key).toMatch(/^fa_live_[0-9a-f]{48}$/);
    const stored = (await pool.query('SELECT key_hash, prefix FROM api_keys')).rows.find(r => r.prefix === k.body.key.slice(0, 12)); expect(stored.key_hash).not.toContain(k.body.key);
    expect((await c.get('/api/org/api-keys')).body.keys[0].key).toBeUndefined();
    expect((await v1('GET', '/v1/me', null)).statusCode).toBe(401); expect((await v1('GET', '/v1/me', 'fa_live_nope_nope_nope_nope')).statusCode).toBe(401);
    expect((await v1('GET', '/v1/me', k.body.key)).statusCode).toBe(200);
    const s = await v1('POST', '/v1/stress', k.body.key, { allocation: { equity: 600000, cash: 400000 }, monthlyExpenses: 30000, annualIncome: 600000, shocks: { equity: -0.3 } });
    expect(s.statusCode).toBe(200); expect(s.json().data.scenarios[0].loss).toBe(-180000); expect(s.json().meta.disclaimer).toMatch(/Not investment/);
    expect((await v1('POST', '/v1/stress', k.body.key, { allocation: { equity: -5 } })).statusCode).toBe(400);
    const p = await v1('POST', '/v1/projection', k.body.key, { start: 100000, monthly: 10000, years: 10, rate: 0.1 }); expect(p.json().data.at(-1).nominal).toBeGreaterThan(2000000);
    const t = await v1('POST', '/v1/tax/regimes', k.body.key, { grossIncome: 1500000 }); expect(t.json().data.ready).toBe(true);
    expect((await v1('POST', '/v1/wellness', k.body.key, { annualIncome: 1200000, monthlyExpenses: 50000, liquidAssets: 150000 })).json().data.ready).toBe(true);
    expect((await c.del(`/api/org/api-keys/${k.body.id}`)).status).toBe(200);
    expect((await v1('GET', '/v1/me', k.body.key)).statusCode).toBe(401);
  });
});
