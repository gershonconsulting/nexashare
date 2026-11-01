import { collectDailySeries, normalizeCounts } from './reporting.js';

export const ENGAGEMENT_LIMITATION = 'Data unavailable: reactions, comments, impressions, profile views and follower growth are not collected. Engagement on an original post is not engagement on your repost. Repost success measures publishing reliability, not LinkedIn engagement.';

export function growth(current, previous) {
  const change = current - previous;
  return { current, previous, change, percent: previous > 0 ? Math.round(change / previous * 1000) / 10 : null,
    label: previous > 0 ? `${change > 0 ? '+' : ''}${Math.round(change / previous * 1000) / 10}% vs previous period` : current > 0 ? 'New activity · previous period had no reposts' : 'No confirmed reposts in either period' };
}

export function performanceNarrative(current, previous) {
  current = { confirmed: Number(current?.confirmed || 0), failed: Number(current?.failed || 0) };
  const comparison = previous ? growth(current.confirmed, Number(previous.confirmed || 0)).label : 'Previous-period comparison unavailable';
  const action = current.failed ? `Review ${current.failed} failed attempt${current.failed === 1 ? '' : 's'} in Activity, check the reported reason, then run a controlled test. A retry is not confirmed until a new successful outcome is recorded.`
    : current.confirmed ? 'Keep monitoring your sources. Use Intelligence to review the topics you shared; engagement-based recommendations are unavailable.'
    : 'Check your monitored sources and extension health, then run a controlled test.';
  return `${current.confirmed} confirmed reposts. ${comparison}. ${action}`;
}

export async function collectPerformance(db, userId, days = 30, date = new Date(), includeToday = true) {
  const series = await collectDailySeries(db, userId, days, date, includeToday);
  const previousDate = new Date(date); previousDate.setUTCDate(previousDate.getUTCDate() - days);
  const previous = await collectDailySeries(db, userId, days, previousDate, includeToday);
  // Today is partial: compare complete days only on both sides. Reports exclude today entirely.
  const total = rows => normalizeCounts(rows.reduce((sum, row) => {
    for (const key of ['confirmed', 'failed', 'skipped', 'already_reposted', 'processed']) sum[key] = (sum[key] || 0) + row[key];
    return sum;
  }, {}));
  const comparable = includeToday ? total(series.daily.slice(0, -1)) : series.totals;
  const baseline = includeToday ? total(previous.daily.slice(1)) : previous.totals;
  const until = new Date(`${series.to}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + 1);
  const sources = (await db.prepare(`SELECT COALESCE(NULLIF(trim(company_name), ''), 'Unknown source') AS source,
    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status IN ('skipped', 'already_reposted') THEN 1 ELSE 0 END) AS skipped,
    MAX(datetime(COALESCE(attempted_at, created_at))) AS last_activity
    FROM reposts WHERE user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime(?)
    AND datetime(COALESCE(attempted_at, created_at)) < datetime(?)
    GROUP BY source ORDER BY confirmed DESC, failed DESC, source LIMIT 100`).bind(userId, series.from, until.toISOString()).all()).results || [];
  return { ...series, comparison: { ...growth(comparable.confirmed, baseline.confirmed),
    from: includeToday ? previous.daily[1].day : previous.from, to: previous.to,
    current_from: series.from, current_to: includeToday ? series.daily.at(-2).day : series.to,
    excludes_today: includeToday, days: includeToday ? days - 1 : days },
    sources: sources.map(row => ({ ...row, success_rate: normalizeCounts(row).success_rate })),
    source_limit: 100, engagement: { available: false, reactions: null, comments: null, impressions: null, followers: null, explanation: ENGAGEMENT_LIMITATION },
    narrative: `${includeToday ? 'Completed days: ' : ''}${performanceNarrative(comparable, baseline)}` };
}
