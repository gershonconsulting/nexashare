-- Account-specific AI comment pilot; drafting and copying do not imply a LinkedIn comment was published.
CREATE TABLE IF NOT EXISTS ai_comment_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repost_id INTEGER NOT NULL,
  comment_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','copied')),
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  copied_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (repost_id) REFERENCES reposts(id)
);
CREATE INDEX IF NOT EXISTS idx_ai_comment_drafts_user_generated ON ai_comment_drafts(user_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_ai_comment_drafts_repost ON ai_comment_drafts(repost_id);
