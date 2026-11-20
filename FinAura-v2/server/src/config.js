import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://finaura:finaura@localhost:5432/finaura'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  // Comma-separated list of allowed browser origins (only needed if the web app is on another origin)
  CORS_ORIGINS: z.string().default(''),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  SESSION_DAYS: z.coerce.number().default(30),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  SERVE_WEB: z.enum(['true', 'false']).default('false'),
  WEB_DIST: z.string().default('../finaura/dist'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('FinAura <no-reply@finaura.local>'),
  ALPHA_VANTAGE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  LOG_LEVEL: z.string().default('info'),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const c = parsed.data;
  return {
    ...c,
    isProd: c.NODE_ENV === 'production',
    cookieSecure: c.COOKIE_SECURE ? c.COOKIE_SECURE === 'true' : c.NODE_ENV === 'production',
    corsOrigins: c.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
  };
}
