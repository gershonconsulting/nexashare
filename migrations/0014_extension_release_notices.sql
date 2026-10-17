-- One row per Chrome extension version announced to report@gershonconsulting.com.
CREATE TABLE IF NOT EXISTS extension_release_notices (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  recipients TEXT,
  provider_message_id TEXT,
  error TEXT,
  outdated_clients INTEGER,
  sent_at TEXT
);
