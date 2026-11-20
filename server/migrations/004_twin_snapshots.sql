-- One row per user per day so the twin can show how its predictions evolve and how reality compared.
CREATE TABLE twin_snapshots (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day             date NOT NULL,
  net_worth       numeric(20,2) NOT NULL,
  projected_final numeric(24,2) NOT NULL,
  prob_funds_last numeric(4,2) NOT NULL,
  inputs          jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, day)
);
