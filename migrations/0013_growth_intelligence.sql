ALTER TABLE oauth_states ADD COLUMN referral_code TEXT;
CREATE TABLE referral_codes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  converted_at TEXT,
  CHECK (referrer_id <> referred_user_id)
);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE TABLE referral_rewards (
  referral_id INTEGER NOT NULL REFERENCES referrals(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (referral_id, user_id)
);
CREATE TABLE referral_payment_events (
  event_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE intelligence_reports (
  user_id INTEGER NOT NULL REFERENCES users(id),
  days INTEGER NOT NULL,
  analysis TEXT,
  model TEXT,
  generated_at TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, days)
);
CREATE INDEX idx_reposts_user_reporting ON reposts(user_id, attempted_at, created_at);
