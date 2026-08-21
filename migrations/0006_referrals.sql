CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id INTEGER NOT NULL,
  referred_user_id INTEGER NOT NULL UNIQUE,
  referral_code_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','qualified','reward_pending','rewarded','rejected')),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qualified_at TEXT,
  reward_status TEXT NOT NULL DEFAULT 'not_configured' CHECK(reward_status IN ('not_configured','pending','applied','rejected')),
  reward_detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id),
  FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status ON referrals(referrer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
