CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  outcome_count INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date, status);
