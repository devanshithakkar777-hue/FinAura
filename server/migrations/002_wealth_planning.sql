-- Holdings that are not priced from a market feed (user-valued), liabilities, planning inputs, insurance.
CREATE TABLE manual_holdings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('fd','pf','sgb','gsec','silver','reit','real_estate','esop')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  invested      numeric(18,2) NOT NULL CHECK (invested >= 0),
  current_value numeric(18,2) CHECK (current_value >= 0),   -- required except for FDs (computed)
  rate          numeric(6,3) CHECK (rate >= 0 AND rate <= 100), -- annual % (FD rate, PF rate, coupon)
  annual_income numeric(18,2) CHECK (annual_income >= 0),   -- rent / REIT payouts
  start_date    date NOT NULL,
  maturity_date date,
  note          text CHECK (char_length(note) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_holdings_user ON manual_holdings(user_id);

CREATE TABLE liabilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('home','auto','personal','education','credit_card','other')),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  outstanding     numeric(18,2) NOT NULL CHECK (outstanding >= 0),
  rate            numeric(6,3) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  emi             numeric(18,2) NOT NULL CHECK (emi >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX liabilities_user ON liabilities(user_id);

CREATE TABLE financial_profile (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age              int CHECK (age BETWEEN 18 AND 90),
  retirement_age   int CHECK (retirement_age BETWEEN 30 AND 90),
  annual_income    numeric(18,2) CHECK (annual_income >= 0),
  monthly_expenses numeric(18,2) CHECK (monthly_expenses >= 0),
  dependents       int NOT NULL DEFAULT 0 CHECK (dependents BETWEEN 0 AND 20),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE insurance_policies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('term','life','health','motor','home','other')),
  insurer        text NOT NULL CHECK (char_length(insurer) BETWEEN 1 AND 80),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  sum_assured    numeric(18,2) NOT NULL CHECK (sum_assured >= 0),
  annual_premium numeric(18,2) NOT NULL CHECK (annual_premium >= 0),
  start_date     date NOT NULL,
  term_years     int CHECK (term_years BETWEEN 1 AND 80),
  family_floater boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insurance_user ON insurance_policies(user_id);
