-- One validated destination for platform-level daily, weekly, and future
-- monthly reports. Preserve the mailbox used before this setting existed.
CREATE TABLE IF NOT EXISTS report_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_email TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO report_settings (id, recipient_email)
VALUES (1, 'report@gershonconsulting.com');
