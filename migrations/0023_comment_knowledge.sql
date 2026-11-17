CREATE TABLE IF NOT EXISTS comment_knowledge (
 user_id INTEGER PRIMARY KEY, business_context TEXT NOT NULL DEFAULT '',
 tone TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '',
 language TEXT NOT NULL DEFAULT 'English', preferred_phrases TEXT NOT NULL DEFAULT '',
 avoid_phrases TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comment_approvals (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, original_post_url TEXT NOT NULL,
 source_name TEXT NOT NULL DEFAULT '', original_post_text TEXT NOT NULL,
 draft_text TEXT NOT NULL, final_text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 edited INTEGER NOT NULL DEFAULT 0, approval_token_hash TEXT NOT NULL UNIQUE,
 email_message_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 decided_at TEXT, UNIQUE(user_id, original_post_url)
);
CREATE INDEX IF NOT EXISTS idx_comment_approvals_user ON comment_approvals(user_id, status, edited);
