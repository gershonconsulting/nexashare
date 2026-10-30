ALTER TABLE reposts ADD COLUMN extension_version TEXT;
ALTER TABLE reposts ADD COLUMN source_type TEXT;
ALTER TABLE reposts ADD COLUMN source_id TEXT;
ALTER TABLE reposts ADD COLUMN source_vanity TEXT;
ALTER TABLE reposts ADD COLUMN discovery_route TEXT;
ALTER TABLE reposts ADD COLUMN discovery_reason TEXT;
ALTER TABLE reposts ADD COLUMN discovery_attempt INTEGER;
CREATE INDEX IF NOT EXISTS idx_reposts_discovery_diagnostics ON reposts(discovery_route, extension_version, status, attempted_at);
