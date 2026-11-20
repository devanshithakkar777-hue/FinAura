-- FinAura Connect: verified expert network, consented handoff, consultations, trust and safety.
CREATE TABLE experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  headline text NOT NULL CHECK (char_length(headline) <= 140),
  bio text NOT NULL CHECK (char_length(bio) <= 1500),
  category text NOT NULL,
  capacity text NOT NULL,
  specialties text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  credentials text NOT NULL CHECK (char_length(credentials) <= 600),
  registration_body text CHECK (char_length(registration_body) <= 80),
  registration_number text CHECK (char_length(registration_number) <= 60),
  years_experience int NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_model text NOT NULL DEFAULT 'per_session' CHECK (fee_model IN ('per_session','hourly','free_first')),
  fee_disclosure text NOT NULL CHECK (char_length(fee_disclosure) BETWEEN 10 AND 500),
  conflicts_disclosure text NOT NULL CHECK (char_length(conflicts_disclosure) BETWEEN 10 AND 500),
  availability jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepts_nri boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','suspended')),
  status_reason text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX experts_status ON experts(status, category);

CREATE TABLE consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat','audio','video','callback','second_opinion')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled','declined')),
  scheduled_for timestamptz,
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 120),
  question text NOT NULL CHECK (char_length(question) <= 1500),
  intake jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_advice text CHECK (char_length(original_advice) <= 3000),
  fee numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending_provider' CHECK (payment_status IN ('pending_provider','waived')),
  meeting_link text CHECK (char_length(meeting_link) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX consultations_user ON consultations(user_id);
CREATE INDEX consultations_expert ON consultations(expert_id);
CREATE TABLE consultation_experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','joined','declined')),
  UNIQUE (consultation_id, expert_id)
);
CREATE TABLE data_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (consultation_id, expert_id)
);
CREATE TABLE share_access_log (id bigserial PRIMARY KEY, share_id uuid NOT NULL REFERENCES data_shares(id) ON DELETE CASCADE, what text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE consult_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  kind text NOT NULL,
  body text NOT NULL CHECK (char_length(body) <= 12000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE consult_messages (
  id bigserial PRIMARY KEY,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('user','expert','ai')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
  due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE expert_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE expert_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text CHECK (char_length(body) <= 800),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','dismissed')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE academy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('webinar','course','article')),
  description text NOT NULL CHECK (char_length(description) <= 1500),
  starts_at timestamptz,
  fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE academy_enrollments (item_id uuid NOT NULL REFERENCES academy_items(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (item_id, user_id));
CREATE TABLE community_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 140),
  body text NOT NULL CHECK (char_length(body) <= 1500),
  category text NOT NULL,
  anonymous boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  expert_id uuid NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE connect_audit (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  role text NOT NULL,
  action text NOT NULL,
  target text,
  meta jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
