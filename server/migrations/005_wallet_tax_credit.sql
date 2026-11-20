CREATE TABLE cash_txns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  direction   text NOT NULL CHECK (direction IN ('in','out')),
  category    text NOT NULL DEFAULT 'Other',
  merchant    text CHECK (char_length(merchant) <= 80),
  description text CHECK (char_length(description) <= 200),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_txns_user_day ON cash_txns(user_id, day DESC);

CREATE TABLE budgets (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      text NOT NULL,
  monthly_limit numeric(14,2) NOT NULL CHECK (monthly_limit >= 0),
  PRIMARY KEY (user_id, category)
);

-- Tax inputs for one user (deductions, HRA, documents checklist). Salary comes from financial_profile.
CREATE TABLE tax_inputs (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_profile (
  user_id                uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_limit            numeric(14,2) CHECK (total_limit >= 0),
  utilised               numeric(14,2) CHECK (utilised >= 0),
  enquiries_6m           int CHECK (enquiries_6m >= 0),
  missed_payments_12m    int CHECK (missed_payments_12m >= 0),
  oldest_account_years   numeric(4,1) CHECK (oldest_account_years >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE credit_scores (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  score   int NOT NULL CHECK (score BETWEEN 300 AND 900),
  source  text NOT NULL DEFAULT 'manual',
  PRIMARY KEY (user_id, day)
);
