CREATE TABLE IF NOT EXISTS admin_weekly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_weekly_reports_status ON admin_weekly_reports(status, sent_at);

