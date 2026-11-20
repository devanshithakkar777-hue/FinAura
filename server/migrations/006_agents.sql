CREATE TABLE agent_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question   text CHECK (char_length(question) <= 500),
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_sessions_user ON agent_sessions(user_id, created_at DESC);

-- Human-in-the-loop: the user tells each agent whether it was right; weights adapt per user.
CREATE TABLE agent_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id   text NOT NULL,
  vote       text NOT NULL CHECK (vote IN ('agree','disagree')),
  note       text CHECK (char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, agent_id)
);
CREATE TABLE agent_weights (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  weight   numeric(4,2) NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0.5 AND 1.5),
  PRIMARY KEY (user_id, agent_id)
);

CREATE TABLE assistant_messages (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  content    text NOT NULL CHECK (char_length(content) <= 6000),
  intent     text,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_messages_user ON assistant_messages(user_id, id DESC);
