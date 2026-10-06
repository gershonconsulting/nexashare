CREATE TABLE IF NOT EXISTS extension_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  team_id INTEGER,
  command TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_extension_commands_pending ON extension_commands(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS extension_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  team_id INTEGER,
  stage TEXT NOT NULL,
  url TEXT,
  metadata TEXT,
  state TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_extension_diagnostics_trace ON extension_diagnostics(trace_id, created_at);

INSERT INTO extension_commands (user_id, team_id, command, payload)
SELECT DISTINCT user_id, team_id, 'run_repost_now', '{"reason":"v1.2.23 rollout"}'
FROM extension_tokens
WHERE revoked_at IS NULL;
