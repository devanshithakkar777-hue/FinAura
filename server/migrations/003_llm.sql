CREATE TABLE llm_usage (
  id                bigserial PRIMARY KEY,
  user_id           uuid REFERENCES users(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  provider          text NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  latency_ms        int NOT NULL DEFAULT 0,
  ok                boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_usage_user_day ON llm_usage(user_id, created_at DESC);
