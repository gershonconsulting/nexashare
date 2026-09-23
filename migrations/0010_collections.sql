CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]',
  hashtags TEXT NOT NULL DEFAULT '[]',
  exclude_keywords TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL DEFAULT 'broad' CHECK(mode IN ('exact','broad','ai')),
  language TEXT NOT NULL DEFAULT 'any',
  max_post_age_days INTEGER NOT NULL DEFAULT 3,
  min_relevance INTEGER NOT NULL DEFAULT 75,
  action TEXT NOT NULL DEFAULT 'suggest' CHECK(action IN ('suggest','auto')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collections_team ON collections(team_id, enabled);

CREATE TABLE IF NOT EXISTS collection_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  post_url TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  post_text TEXT NOT NULL DEFAULT '',
  relevance INTEGER,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','reposted','skipped')),
  matched_terms TEXT NOT NULL DEFAULT '[]',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(collection_id, post_url),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_candidates_team ON collection_candidates(team_id, status, discovered_at);