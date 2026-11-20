import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { buildApp } from '../src/app.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://finaura:finaura@localhost:5432/finaura_test';

export async function setup() {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, LOG_LEVEL: 'silent' });
  const pool = createPool(config);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, { info() {}, log() {} });
  const app = await buildApp({ config, pool, logger: false });
  await app.ready();
  return { app, pool, config };
}

export const H = { 'x-finaura': '1', 'content-type': 'application/json' };

let ipN = 1;
export function client(app) {
  let cookie = '';
  // each simulated client gets its own IP so per-IP rate limits behave as in production
  const remoteAddress = `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN++ & 255}`;
  const call = async (method, url, body) => {
    const res = await app.inject({ method, url, remoteAddress, headers: { ...H, ...(cookie ? { cookie } : {}) }, payload: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers['set-cookie'];
    if (set) { const c = Array.isArray(set) ? set[0] : set; cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0]; }
    let json = null;
    try { json = res.json(); } catch { /* not json */ }
    return { status: res.statusCode, body: json, headers: res.headers };
  };
  return { get: u => call('GET', u), post: (u, b = {}) => call('POST', u, b), patch: (u, b) => call('PATCH', u, b), del: (u, b) => call('DELETE', u, b), cookie: () => cookie };
}

let n = 0;
export async function newUser(app, over = {}) {
  const c = client(app);
  const email = over.email ?? `user${Date.now()}_${n++}@example.com`;
  const res = await c.post('/api/auth/register', { email, password: 'Sup3r-secret-pass', name: 'Test User', acceptTerms: true, ...over });
  return { c, email, res };
}
