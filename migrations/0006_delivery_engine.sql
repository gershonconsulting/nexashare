CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'amplify' CHECK(objective IN ('amplify','authority','convert')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','paused','completed')),
  target_reposts INTEGER NOT NULL DEFAULT 0,
  original_post_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_team_status ON campaigns(team_id, status);

CREATE TABLE IF NOT EXISTS delivery_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  team_id INTEGER NOT NULL,
  user_id INTEGER,
  source_type TEXT NOT NULL DEFAULT 'company' CHECK(source_type IN ('company','person','campaign')),
  source_id INTEGER,
  company_name TEXT,
  original_post_url TEXT NOT NULL,
  post_text TEXT,
  commentary TEXT,
  commentary_status TEXT NOT NULL DEFAULT 'none' CHECK(commentary_status IN ('none','suggested','approved','edited')),
  wave INTEGER NOT NULL DEFAULT 1,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','processing','published','failed','skipped','already_reposted')),
  failure_code TEXT,
  failure_detail TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  repost_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(team_id, user_id, original_post_url)
);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_team_status ON delivery_jobs(team_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_retry ON delivery_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_campaign ON delivery_jobs(campaign_id, status);
