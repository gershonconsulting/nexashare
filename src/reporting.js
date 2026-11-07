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

// ---- One date basis for every daily e-mail (admin digest and per-user reports) ----
// Both e-mails count the same America/New_York calendar day, so their numbers agree.
// The cron fires at 06:00 UTC (01:00/02:00 ET), when the previous ET day is complete.
export const REPORT_TIME_ZONE = 'America/New_York';
export const REPORT_SOURCE = 'NexaShare reposts table (extension-reported outcomes; confirmed = LinkedIn acknowledged)';

function zoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function zonedMidnight(year, month, day, timeZone) {
  const wall = Date.UTC(year, month - 1, day);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

export function zonedDayKey(date, timeZone = REPORT_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const sqlTime = date => date.toISOString().slice(0, 19).replace('T', ' ');

// The ET calendar day `daysBack` days before `now` (1 = yesterday), as half-open UTC
// bounds [from, to) usable in SQL: datetime(x) >= datetime(from) AND datetime(x) < datetime(to).
export function reportDayWindow(now = new Date(), daysBack = 1, timeZone = REPORT_TIME_ZONE) {
  const [y, m, d] = zonedDayKey(now, timeZone).split('-').map(Number);
  const startDay = new Date(Date.UTC(y, m - 1, d - daysBack));
  const endDay = new Date(Date.UTC(y, m - 1, d - daysBack + 1));
  const start = zonedMidnight(startDay.getUTCFullYear(), startDay.getUTCMonth() + 1, startDay.getUTCDate(), timeZone);
  const end = zonedMidnight(endDay.getUTCFullYear(), endDay.getUTCMonth() + 1, endDay.getUTCDate(), timeZone);
  return { day: startDay.toISOString().slice(0, 10), timeZone, label: 'ET', from: sqlTime(start), to: sqlTime(end) };
}

export function dateBasisFooter(window, source = REPORT_SOURCE, generatedAt = new Date()) {
  return `Counts for ${window.day} ET · source ${source} · generated ${sqlTime(generatedAt)} UTC`;
}

// `period` is a reportDayWindow (preferred) or a legacy SQLite date offset such as '-1 day'.
export async function collectDaySummary(db, userId, period) {
  const row = typeof period === 'object' && period
    ? await db.prepare(`SELECT ${COUNTS} FROM reposts
        WHERE user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime(?)
          AND datetime(COALESCE(attempted_at, created_at)) < datetime(?)`).bind(userId, period.from, period.to).first()
    : await db.prepare(`SELECT ${COUNTS} FROM reposts
        WHERE user_id = ? AND date(COALESCE(attempted_at, created_at)) = date('now', ?)`).bind(userId, period).first();
  const counts = normalizeCounts(row || {});
  return { ...counts, skipped: counts.skipped + counts.already_reposted, rate: counts.success_rate };
}

export function dailyTableHtml(series) {
  if (!series?.daily?.length) return '';
  return `<h3>Day-by-day success (UTC)</h3><table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:13px"><thead><tr><th align="left">Date</th><th>Confirmed</th><th>Failed</th><th>Skipped</th><th>Success</th><th>Activity</th></tr></thead><tbody>${series.daily.map(row => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${row.day}</td><td align="center">${row.confirmed}</td><td align="center">${row.failed}</td><td align="center">${row.skipped + row.already_reposted}</td><td align="center">${row.success_rate === null ? 'N/A' : row.success_rate + '%'}</td><td>${row.status.replaceAll('_', ' ')}</td></tr>`).join('')}</tbody></table><p style="font-size:12px;color:#667085">${RATE_DEFINITION}</p>`;
}

export function dailyTableText(series) {
  return series?.daily?.length ? `Day-by-day success (UTC)\n${series.daily.map(row => `${row.day}: ${row.confirmed} confirmed, ${row.failed} failed, ${row.skipped + row.already_reposted} skipped; ${row.success_rate === null ? 'N/A' : row.success_rate + '%'}; ${row.status.replaceAll('_', ' ')}`).join('\n')}\n${RATE_DEFINITION}\n` : '';
}
