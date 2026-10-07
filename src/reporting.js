import { proofOfConceptProgress } from './access-policy.js';
export const RATE_DEFINITION = 'Confirmed ÷ (confirmed + failed). Skipped and already reposted are excluded. No attempts = N/A.';

export function rate(confirmed, failed) {
  const attempts = Number(confirmed || 0) + Number(failed || 0);
  return attempts ? Math.round(Number(confirmed || 0) / attempts * 1000) / 10 : null;
}

export function rateLabel(confirmed, failed) {
  const value = rate(confirmed, failed);
  return value === null ? 'N/A — no attempts' : `${value}% success`;
}

export function normalizeCounts(row = {}) {
  const result = {};
  for (const key of ['confirmed', 'failed', 'skipped', 'already_reposted', 'processed', 'companies']) result[key] = Number(row[key] || 0);
  result.attempts = result.confirmed + result.failed;
  result.success_rate = rate(result.confirmed, result.failed);
  return result;
}

const COUNTS = `SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
  SUM(CASE WHEN status = 'already_reposted' THEN 1 ELSE 0 END) AS already_reposted,
  COUNT(*) AS processed, COUNT(DISTINCT NULLIF(company_name, '')) AS companies`;

export async function collectDailySeries(db, userId, days = 30, date = new Date(), includeToday = true) {
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (!includeToday) end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const next = new Date(end); next.setUTCDate(next.getUTCDate() + 1);
  const until = next.toISOString().slice(0, 10);
  const [outcomes, runs] = await Promise.all([
    db.prepare(`SELECT date(COALESCE(attempted_at, created_at)) AS day, ${COUNTS}
      FROM reposts WHERE user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime(?)
      AND datetime(COALESCE(attempted_at, created_at)) < datetime(?) GROUP BY day`).bind(userId, from, until).all(),
    db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS runs FROM extension_runs
      WHERE user_id = ? AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) GROUP BY day`).bind(userId, from, until).all()
  ]);
  const outcomeMap = new Map((outcomes.results || []).map(row => [row.day, row]));
  const runMap = new Map((runs.results || []).map(row => [row.day, Number(row.runs)]));
  const daily = Array.from({ length: days }, (_, i) => {
    const current = new Date(start); current.setUTCDate(current.getUTCDate() + i);
    const day = current.toISOString().slice(0, 10);
    const counts = normalizeCounts(outcomeMap.get(day));
    const runCount = runMap.get(day) || 0;
    const status = counts.failed ? (counts.confirmed ? 'orange' : 'red') : counts.confirmed ? 'green' : runCount ? 'quiet' : 'no_run';
    return { day, ...counts, runs: runCount, status, partial: includeToday && day === date.toISOString().slice(0, 10) };
  });
  const totals = daily.reduce((sum, row) => {
    for (const key of ['confirmed', 'failed', 'skipped', 'already_reposted', 'processed']) sum[key] += row[key];
    return sum;
  }, { confirmed: 0, failed: 0, skipped: 0, already_reposted: 0, processed: 0 });
  const completed = daily.filter(row => !row.partial).reduce((sum, row) => {
    sum.confirmed += row.confirmed; sum.failed += row.failed; return sum;
  }, { confirmed: 0, failed: 0 });
  return { timezone: 'UTC', from, to, days, definition: RATE_DEFINITION, daily, totals: normalizeCounts(totals),
    proof_of_concept: { ...proofOfConceptProgress(completed.confirmed, completed.failed),
      confirmed: completed.confirmed, failed: completed.failed,
      from, to: daily.filter(row => !row.partial).at(-1)?.day || null, excludes_today: includeToday } };
}

export async function collectDaySummary(db, userId, offset) {
  const counts = normalizeCounts(await db.prepare(`SELECT ${COUNTS} FROM reposts
    WHERE user_id = ? AND date(COALESCE(attempted_at, created_at)) = date('now', ?)`).bind(userId, offset).first() || {});
  return { ...counts, skipped: counts.skipped + counts.already_reposted, rate: counts.success_rate };
}

export function dailyTableHtml(series) {
  if (!series?.daily?.length) return '';
  return `<h3>Day-by-day success (UTC)</h3><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:13px"><thead><tr><th align="left">Date</th><th>Confirmed</th><th>Failed</th><th>Skipped</th><th>Success</th><th>Activity</th></tr></thead><tbody>${series.daily.map(row => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${row.day}</td><td align="center">${row.confirmed}</td><td align="center">${row.failed}</td><td align="center">${row.skipped + row.already_reposted}</td><td align="center">${row.success_rate === null ? 'N/A' : row.success_rate + '%'}</td><td>${row.status.replaceAll('_', ' ')}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#667085">${RATE_DEFINITION}</p>`;
}

export function dailyTableText(series) {
  return series?.daily?.length ? `Day-by-day success (UTC)\n${series.daily.map(row => `${row.day}: ${row.confirmed} confirmed, ${row.failed} failed, ${row.skipped + row.already_reposted} skipped; ${row.success_rate === null ? 'N/A' : row.success_rate + '%'}; ${row.status.replaceAll('_', ' ')}`).join('\n')}\n${RATE_DEFINITION}\n` : '';
}
