-- Per-user switch for the 06:00 UTC daily activity email.
-- 1 = ON (default for everyone), 0 = OFF (no daily email is sent).
ALTER TABLE users ADD COLUMN daily_report_enabled INTEGER NOT NULL DEFAULT 1;

-- 2026-10-19: Anne Bougel asked to stop receiving daily reports.
-- OFF until further notice; turn back on from /admin-progress.html or her Settings.
UPDATE users SET daily_report_enabled = 0
WHERE id = 7 AND lower(email) = 'abougel@altavia.co';
