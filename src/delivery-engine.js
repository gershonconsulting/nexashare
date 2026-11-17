export const DELIVERY_STATUSES = Object.freeze({
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ALREADY_REPOSTED: 'already_reposted'
});

const TRANSIENT_FAILURE_PATTERNS = [
  /did not finish loading/i,
  /did not return an outcome/i,
  /timeout/i,
  /temporar/i,
  /network/i,
  /http 429/i,
  /http 5\d\d/i
];

export function classifyFailure(detail = '') {
  const text = String(detail || '').slice(0, 2000);
  if (/sign.?in|not.logged.in|session/i.test(text)) return { code: 'linkedin_session_required', retryable: false };
  if (/no new eligible posts/i.test(text)) return { code: 'no_eligible_post', retryable: false };
  if (/paused/i.test(text)) return { code: 'source_paused', retryable: false };
  if (/repost control|direct repost action/i.test(text)) return { code: 'repost_control_unavailable', retryable: true };
  if (/loading|posts were found/i.test(text)) return { code: 'post_discovery_failed', retryable: true };
  if (TRANSIENT_FAILURE_PATTERNS.some(pattern => pattern.test(text))) return { code: 'transient_linkedin_failure', retryable: true };
  return { code: 'linkedin_repost_failed', retryable: false };
}

export function retryDelayMinutes(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  return Math.min(24 * 60, 15 * (2 ** (attempt - 1)));
}

export function deliveryStatusFromOutcome(outcome) {
  if (outcome?.status === 'confirmed') return DELIVERY_STATUSES.PUBLISHED;
  if (outcome?.status === 'already_reposted') return DELIVERY_STATUSES.ALREADY_REPOSTED;
  if (outcome?.status === 'skipped') return DELIVERY_STATUSES.SKIPPED;
  return DELIVERY_STATUSES.FAILED;
}

export function canonicalDeliveryPostUrl(postUrl) {
  const url = new URL(postUrl);
  const activity = url.pathname.match(/urn:li:activity:(\d{15,})|activity-(\d{15,})/);
  return activity ? `https://www.linkedin.com/feed/update/urn:li:activity:${activity[1] || activity[2]}/` : url.href;
}

export async function markDeliveryProcessing(db, { teamId, userId, postUrl }) {
  postUrl = canonicalDeliveryPostUrl(postUrl);
  const result = await db.prepare(
    `INSERT INTO delivery_jobs (team_id, user_id, original_post_url, status, attempt_count, started_at, updated_at)
     VALUES (?, ?, ?, 'processing', 1, datetime('now'), datetime('now'))
     ON CONFLICT(team_id, user_id, original_post_url) DO UPDATE SET
       status = 'processing', attempt_count = delivery_jobs.attempt_count + 1,
       started_at = datetime('now'), updated_at = datetime('now'), failure_code = NULL, failure_detail = NULL
     WHERE delivery_jobs.status IN ('scheduled', 'failed', 'skipped')
       AND COALESCE(delivery_jobs.failure_code, '') != 'confirmation_unknown'
       AND COALESCE(delivery_jobs.failure_detail, '') NOT LIKE '%did not provide visible confirmation%'
       AND COALESCE(delivery_jobs.failure_detail, '') NOT LIKE '%did not return an outcome%'`
  ).bind(teamId, userId, postUrl).run();
  return { acquired: Number(result.meta?.changes || 0) === 1 };
}

export async function recordDeliveryOutcome(db, { teamId, userId, outcome }) {
  outcome = { ...outcome, postUrl: canonicalDeliveryPostUrl(outcome.postUrl) };
  const status = deliveryStatusFromOutcome(outcome);
  // An absent confirmation can mean the click succeeded. Never automatically
  // re-acquire these posts on another device or after a service-worker restart.
  const failure = status === DELIVERY_STATUSES.FAILED
    ? (/did not provide visible confirmation|did not return an outcome|after progressive recovery/i.test(outcome?.detail || '')
      ? { code: 'confirmation_unknown', retryable: false } : classifyFailure(outcome?.detail)) : null;
  const current = await db.prepare(
    'SELECT id, status, attempt_count, max_attempts FROM delivery_jobs WHERE team_id = ? AND user_id = ? AND original_post_url = ?'
  ).bind(teamId, userId, outcome.postUrl).first();
  if (['published', 'already_reposted'].includes(current?.status) && status !== DELIVERY_STATUSES.PUBLISHED) {
    return { status: current.status, retryScheduled: false, failureCode: null };
  }
  const attempts = Number(current?.attempt_count || 1);
  const maxAttempts = Number(current?.max_attempts || 3);
  const shouldRetry = !!failure?.retryable && attempts < maxAttempts;
  const retryMinutes = retryDelayMinutes(attempts);

  if (!current) {
    await db.prepare(
      `INSERT INTO delivery_jobs
       (team_id, user_id, original_post_url, post_text, company_name, status, failure_code, failure_detail,
        attempt_count, next_retry_at, completed_at, repost_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1,
        CASE WHEN ? THEN datetime('now', '+' || ? || ' minutes') ELSE NULL END,
        CASE WHEN ? THEN NULL ELSE datetime('now') END, ?, datetime('now'))`
    ).bind(
      teamId, userId, outcome.postUrl, String(outcome.postTextSnippet || '').slice(0, 2000),
      String(outcome.companyName || '').slice(0, 100), status, failure?.code || null,
      String(outcome.detail || '').slice(0, 2000), shouldRetry ? 1 : 0, retryMinutes,
      shouldRetry ? 1 : 0, outcome.repostUrl || null
    ).run();
    return { status, retryScheduled: shouldRetry, failureCode: failure?.code || null };
  }

  await db.prepare(
    `UPDATE delivery_jobs SET status = ?, failure_code = ?, failure_detail = ?, repost_url = ?,
       post_text = CASE WHEN ? != '' THEN ? ELSE post_text END, company_name = ?,
       next_retry_at = CASE WHEN ? THEN datetime('now', '+' || ? || ' minutes') ELSE NULL END,
       completed_at = CASE WHEN ? THEN NULL ELSE datetime('now') END, updated_at = datetime('now')
     WHERE id = ? AND (status NOT IN ('published', 'already_reposted') OR ? = 'published')`
  ).bind(
    status, failure?.code || null, String(outcome.detail || '').slice(0, 2000), outcome.repostUrl || null,
    String(outcome.postTextSnippet || '').slice(0, 2000), String(outcome.postTextSnippet || '').slice(0, 2000),
    String(outcome.companyName || '').slice(0, 100),
    shouldRetry ? 1 : 0, retryMinutes, shouldRetry ? 1 : 0, current.id, status
  ).run();
  return { status, retryScheduled: shouldRetry, failureCode: failure?.code || null };
}

export async function getCampaignHealth(db, teamId) {
  const counts = await db.prepare(
    `SELECT status, COUNT(*) AS count FROM delivery_jobs WHERE team_id = ? GROUP BY status`
  ).bind(teamId).all();
  const byStatus = Object.fromEntries((counts.results || []).map(row => [row.status, Number(row.count || 0)]));
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  const published = byStatus.published || 0;
  const failed = byStatus.failed || 0;
  const inFlight = (byStatus.scheduled || 0) + (byStatus.processing || 0);
  return {
    total,
    published,
    failed,
    in_flight: inFlight,
    success_rate: total ? Math.round((published / total) * 1000) / 10 : 0,
    by_status: byStatus
  };
}
