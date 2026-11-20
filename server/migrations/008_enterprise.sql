-- Advisor / enterprise layer: organisations, consented client links, access log, API keys.
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  brand_name text CHECK (char_length(brand_name) <= 60),
  primary_color text CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  disclaimer text CHECK (char_length(disclaimer) <= 600),
  registration_note text CHECK (char_length(registration_note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_email text NOT NULL,
  client_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','revoked')),
  requested_scope jsonb NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_email)
);
CREATE INDEX client_links_user ON client_links(client_user_id);
CREATE TABLE advisor_access_log (
  id bigserial PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES client_links(id) ON DELETE CASCADE,
  what text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
