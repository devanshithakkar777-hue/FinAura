-- Family IQ, estate, global & private assets, dividends, ESG, learning, life events, co-pilot, bias lab.
CREATE TABLE households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active')),
  share_level text NOT NULL DEFAULT 'summary' CHECK (share_level IN ('summary','full')),
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, email)
);
CREATE INDEX hm_user ON household_members(user_id);
CREATE TABLE shared_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  paid_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE estate_plan (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  will_exists boolean NOT NULL DEFAULT false,
  will_updated_on date,
  guardian_named boolean NOT NULL DEFAULT false,
  power_of_attorney boolean NOT NULL DEFAULT false,
  nominees_updated_on date,
  notes text CHECK (char_length(notes) <= 400),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  relation text NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 40),
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  minor boolean NOT NULL DEFAULT false
);
CREATE INDEX beneficiaries_user ON beneficiaries(user_id);

CREATE TABLE private_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('property','pe_vc','startup','art','collectible','p2p','commodity','foreign','other')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  currency text NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
  fx_rate numeric(14,4) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  invested numeric(18,2) NOT NULL CHECK (invested >= 0),
  current_value numeric(18,2) NOT NULL CHECK (current_value >= 0),
  start_date date NOT NULL,
  lockin_until date,
  monthly_income numeric(18,2) NOT NULL DEFAULT 0 CHECK (monthly_income >= 0),
  annual_costs numeric(18,2) NOT NULL DEFAULT 0 CHECK (annual_costs >= 0),
  loan_outstanding numeric(18,2) NOT NULL DEFAULT 0 CHECK (loan_outstanding >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX private_assets_user ON private_assets(user_id);

CREATE TABLE dividends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 20),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  received_on date NOT NULL
);
CREATE INDEX dividends_user ON dividends(user_id, received_on);
CREATE TABLE esg_ratings (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  e int CHECK (e BETWEEN 0 AND 100), s int CHECK (s BETWEEN 0 AND 100), g int CHECK (g BETWEEN 0 AND 100),
  excluded boolean NOT NULL DEFAULT false,
  source text CHECK (char_length(source) <= 80),
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE learn_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE TABLE bias_results (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  bias text NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);
CREATE TABLE life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  planned_on date,
  note text CHECK (char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE copilot_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  detail jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','dismissed','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (user_id, key)
);
