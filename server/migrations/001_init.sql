-- FinAura schema v1 (PostgreSQL 14+)

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  password_hash       text NOT NULL,
  name                text NOT NULL,
  handle              text,
  risk_profile        text CHECK (risk_profile IN ('Conservative','Moderate','Aggressive')),
  quiz_score          int,
  currency            text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD','EUR','GBP')),
  xp                  int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak_days         int NOT NULL DEFAULT 0,
  last_active_on      date,
  leaderboard_opt_in  boolean NOT NULL DEFAULT false,
  email_verified_at   timestamptz,
  failed_logins       int NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx  ON users (lower(email));
CREATE UNIQUE INDEX users_handle_lower_idx ON users (lower(handle)) WHERE handle IS NOT NULL;

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip          text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('verify','reset')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- DPDP: record of what each user agreed to, and when
CREATE TABLE consents (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL,
  version     text NOT NULL,
  granted     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_idx ON consents (user_id, purpose, created_at DESC);

-- Audit trail survives user deletion (user_id is nulled, not cascaded)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_log (user_id, created_at DESC);

CREATE TABLE assets (
  symbol      text PRIMARY KEY,
  name        text NOT NULL,
  asset_class text NOT NULL CHECK (asset_class IN ('equity','crypto','mutualFund','bond','gold','cash')),
  volatility  text NOT NULL DEFAULT 'Moderate' CHECK (volatility IN ('Low','Moderate','High')),
  -- verified = curated or provider-backed; user-created assets are unverified and immutable after creation
  verified    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_history (
  symbol  text NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  day     date NOT NULL,
  close   numeric(18,4) NOT NULL CHECK (close > 0),
  source  text NOT NULL DEFAULT 'manual',
  PRIMARY KEY (symbol, day)
);

CREATE TABLE transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES assets(symbol),
  side         text NOT NULL CHECK (side IN ('buy','sell')),
  quantity     numeric(20,6) NOT NULL CHECK (quantity > 0),
  price        numeric(18,4) NOT NULL CHECK (price > 0),
  executed_on  date NOT NULL,
  note         text,
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','demo')),
  nudge_id     uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON transactions (user_id, executed_on);

CREATE TABLE goals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  target_amount         numeric(18,2) NOT NULL CHECK (target_amount > 0),
  target_date           date NOT NULL,
  monthly_contribution  numeric(18,2) NOT NULL DEFAULT 0 CHECK (monthly_contribution >= 0),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_user_idx ON goals (user_id);

-- Pre-mortem checks run before a trade
CREATE TABLE nudges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          text NOT NULL REFERENCES assets(symbol),
  side            text NOT NULL CHECK (side IN ('buy','sell')),
  quantity        numeric(20,6) NOT NULL CHECK (quantity > 0),
  price           numeric(18,4) NOT NULL CHECK (price > 0),
  risk_level      text NOT NULL CHECK (risk_level IN ('low','medium','high')),
  analysis        jsonb NOT NULL,
  decision        text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','proceeded','waited','cancelled')),
  cooldown_until  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX nudges_user_idx ON nudges (user_id, created_at DESC);

CREATE TABLE xp_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  points      int NOT NULL CHECK (points > 0),
  ref         text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);

CREATE TABLE achievements (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key          text NOT NULL,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE council_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    text,
  result      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX council_user_idx ON council_sessions (user_id, created_at DESC);
