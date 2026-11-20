# FinAura

Behavior-first investing intelligence. FinAura measures what your own decisions have cost you, stops the next emotional mistake before you make it, and simulates the future you're building.

| Feature | What it does |
|---|---|
| **Behavioral Alpha** | Replays your history against a "stay the course" version of you (same buys, no sells). The difference is the cost or gain of your decisions. Also tags panic sells / FOMO buys and scores traits. |
| **Pre-mortem check** | Before a trade: your own history in similar moments, market evidence, a cooldown for high-risk sells, a checklist, and a tax note. Outcomes are recorded. |
| **Advisory council** | Risk, Behavior, Tax and Goals agents each take a stance; a moderator weighs them and surfaces dissent. Optional LLM-written summary. |
| **Digital twin** | Seeded Monte Carlo of a disciplined you vs. a habit-driven you through baseline, crash, slow-bear and crypto-winter scenarios. |
| Portfolio, goals, rewards | FIFO ledger, CSV import, health score, goal projections, XP/achievements, opt-in leaderboard. |
| Privacy | Cookie sessions (hashed tokens), CSRF header, lockout + rate limits, consent records, full data export, account deletion. |

## Stack
React 19 + Vite + Tailwind 4 + Framer Motion (custom SVG charts) · Node 22 + Fastify 5 · **PostgreSQL 16** (SQL migrations run on boot) · Docker.

## Run it
**Docker (production-like):**
```bash
cp .env.example .env     # set POSTGRES_PASSWORD, PUBLIC_URL, SMTP_URL ...
docker compose up -d --build
# http://localhost:8080  (for a plain-http local trial set COOKIE_SECURE=false)
```
**Development:**
```bash
createdb finaura && createdb finaura_test      # Postgres 16 running locally
cd server && cp ../.env.example .env           # set DATABASE_URL=postgres://user:pass@localhost:5432/finaura
npm ci && npm run dev                          # API on :8080 (migrates on boot)
cd ../finaura && npm ci && npm run dev         # web on :5173, proxies /api
```
**Checks:** `cd server && npm run lint && npm test` (63 tests, real Postgres; set `TEST_DATABASE_URL` if needed) · `cd finaura && npm run lint && npm test && npm run build`. CI runs both (`.github/workflows/ci.yml`).

## Configuration (server env)
`DATABASE_URL` (required), `PUBLIC_URL`, `COOKIE_SECURE`, `CORS_ORIGINS`, `SESSION_DAYS`, `SERVE_WEB`, `SMTP_URL`, `MAIL_FROM`, `ALPHA_VANTAGE_KEY` (live prices), `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (council summaries), `DATABASE_SSL`, `LOG_LEVEL`. See `server/src/config.js`.

## Before you take real users — what code can't do for you
1. **SEBI registration.** Personalised investment recommendations need Registered Investment Adviser status. Until then FinAura is built and worded as *educational analysis* (disclaimers throughout). Don't market it as advice. Get a securities lawyer to review wording, Terms and Privacy Notice (the app records consent to version `2026-11` of both — you must publish them).
2. **Real market data.** Without `ALPHA_VANTAGE_KEY` (or another licensed provider wired into `server/src/lib/market.js`) only the synthetic `DEMO_*` assets have prices; user-added assets have none. Check the provider's licence for commercial use.
3. **Portfolio import.** Users enter trades manually or via CSV. Automatic import needs an RBI Account Aggregator (FIU) agreement or a broker API.
4. **Email.** Set `SMTP_URL`; without it verification and reset links are only logged.
5. **Hosting.** Terminate TLS in front of the app, keep `COOKIE_SECURE=true`, use managed Postgres with backups, rotate secrets, and set up monitoring/alerts. India's DPDP Act: appoint a grievance contact and review retention.
6. **Security review** by a third party before handling real financial data.

## Known limitations
- User-created assets are unverified and immutable after creation; first-come naming (squatting) is accepted for now.
- Demo data is synthetic and clearly labelled; Behavioral Alpha/Twin on it are illustrative.
- Twin and goal projections use fixed assumptions per asset class — not forecasts.
- Prices can only be written by the provider or demo seed, never by users.

## v2 modules

Core (twin, behaviour, council) plus: Simulator (life twin, what-if, stress), Wellness, Wealth (incl. private/global assets, dividends, ESG), Planning, Wallet, Tax (India FY2026-27 estimates), Credit, Family & Estate, Learn (lessons, psychology lab, life events), Assistant, Co-Pilot, five-agent Council with feedback, Advisors & API (white-label, consented client access), and FinAura Connect (verified experts, AI match, consented data sharing, sessions, academy, community, admin).

### Environment
`DATABASE_URL`, `SESSION_SECRET`, optional `GROQ_API_KEY` (LLM narration; deterministic fallbacks work without it), `ADMIN_EMAILS` (comma-separated; can verify Connect experts), SMTP settings for email.

### Honest limits
- No live market prices, demat/Account Aggregator link or credit-bureau feed: values are entered by the user.
- Connect: verification is a manual admin review; video/audio and payments need a provider (payments are `pending_provider`).
- Co-Pilot only proposes; the AI never gives regulated recommendations.
- Tax is India-only and an estimate; confirm with a chartered accountant.
