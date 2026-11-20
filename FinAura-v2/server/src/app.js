import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError } from 'zod';
import { sha256, HttpError } from './lib/security.js';
import { createMailer } from './lib/mailer.js';
import { authRoutes } from './routes/auth.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { insightRoutes } from './routes/insights.js';

export const SESSION_COOKIE = 'fa_session';

export async function buildApp({ config, pool, logger }) {
  const app = Fastify({
    logger: logger ?? { level: config.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: true,            // behind a load balancer; needed for correct client IPs / rate limiting
    bodyLimit: 2 * 1024 * 1024,  // CSV imports
  });

  app.decorate('config', config);
  app.decorate('pool', pool);
  app.decorate('mailer', createMailer(config, app.log));
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Accept empty bodies on JSON requests (e.g. bodyless DELETE/POST sent with a JSON content-type).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body) return done(null, {});
    try { done(null, JSON.parse(body)); } catch { const e = new Error('Invalid JSON body'); e.statusCode = 400; done(e); }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    strictTransportSecurity: config.isProd,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  if (config.corsOrigins.length) {
    await app.register(cors, { origin: config.corsOrigins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  }
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  // CSRF: cookies are SameSite=Lax, and every state-changing request must carry a custom header
  // that cross-site forms cannot set.
  app.addHook('onRequest', async (req) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.url.startsWith('/api/') && req.headers['x-finaura'] !== '1') {
      throw new HttpError(403, 'Missing CSRF header', 'csrf');
    }
  });

  app.decorate('requireAuth', async (req) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'Not signed in', 'unauthenticated');
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.expires_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]);
    if (!rows.length) throw new HttpError(401, 'Session expired', 'unauthenticated');
    const { session_id, expires_at, ...user } = rows[0];
    req.user = user;
    req.sessionId = session_id;
    // sliding expiry (touch at most once a day)
    if (new Date(expires_at).getTime() - Date.now() < (config.SESSION_DAYS - 1) * 86_400_000) {
      await pool.query(`UPDATE sessions SET expires_at = now() + ($2 || ' days')::interval WHERE id = $1`, [session_id, String(config.SESSION_DAYS)]);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Invalid input', code: 'validation', issues: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    }
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: err.message, code: err.code ?? 'bad_request' });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: 'Something went wrong', code: 'internal' });
  });

  app.get('/health', async (req, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ok' }; }
    catch { return reply.status(503).send({ status: 'db_unavailable' }); }
  });

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(portfolioRoutes, { prefix: '/api' });
  await app.register(insightRoutes, { prefix: '/api' });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found', code: 'not_found' });
    // SPA fallback
    if (config.SERVE_WEB === 'true') return reply.sendFile('index.html');
    return reply.status(404).send({ error: 'Not found' });
  });

  if (config.SERVE_WEB === 'true') {
    const root = path.resolve(config.WEB_DIST);
    if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`SERVE_WEB=true but no build found at ${root}`);
    await app.register(fastifyStatic, { root, wildcard: false });
  }

  return app;
}
