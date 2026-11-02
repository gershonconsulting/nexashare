CREATE TABLE IF NOT EXISTS repost_thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  original_post_url TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  thoughts TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','generated','submitting','published','failed','unknown')),
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  confirmed_at TEXT,
  repost_url TEXT,
  detail TEXT,
  UNIQUE(user_id,original_post_url)
);
CREATE INDEX IF NOT EXISTS idx_repost_thoughts_user_date ON repost_thoughts(user_id,generated_at);
CREATE TABLE IF NOT EXISTS repost_thought_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
