ALTER TABLE reposts ADD COLUMN outcome_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reposts_user_outcome_id
ON reposts(user_id, outcome_id)
WHERE outcome_id IS NOT NULL;
