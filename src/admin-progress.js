// Platform-wide progress of repost results for every NexaShare user.
// Served at GET /api/admin/progress and rendered by /admin-progress.html.
// Access is limited to platform admins (PLATFORM_ADMIN_EMAILS), NOT team
// admins: every user who registers becomes admin of their own team.

export const DEFAULT_PLATFORM_ADMINS = ['oattia@gmail.com'];
const MIN_DAYS = 7;
const MAX_DAYS = 180;
const STALL_AFTER_DAYS = 3;

export function platformAdminEmails(env) {
  const raw = String(env?.PLATFORM_ADMIN_EMAILS || '').trim();
  const list = raw ? raw.split(',') : DEFAULT_PLATFORM_ADMINS;
  return list.map(email => email.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformAdmin(user, env) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(email) && platformAdminEmails(env).includes(email);
}

export function clampDays(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, n));
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function dayRange(days, today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(isoDay(new Date(end.getTime() - i * 86400000)));
  return out;
}

function bucket(status) {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'failed') return 'failed';
  return 'skipped'; // skipped + already_reposted: not an attempt
}

function rate(confirmed, failed) {
  return (confirmed + failed) ? Math.round((confirmed / (confirmed + failed)) * 100) : null;
}

function emptyDay(day) {
  return { day, confirmed: 0, failed: 0, skipped: 0 };
}

function sumWindow(series, from, to) {
  return series.slice(from, to).reduce((acc, d) => {
    acc.confirmed += d.confirmed; acc.failed += d.failed; acc.skipped += d.skipped; return acc;
  }, { confirmed: 0, failed: 0, skipped: 0 });
}

// Pure: turns raw query rows into the payload. Kept separate so it is testable
// without D1.
export function buildProgress({ users = [], daily = [], totals = [], extensions = [], companies = [], days = 30, today = new Date() }) {
  const range = dayRange(days, today);
  const index = new Map(range.map((d, i) => [d, i]));
  const todayIso = range[range.length - 1];
  const stallCutoff = isoDay(new Date(Date.parse(`${todayIso}T00:00:00Z`) - (STALL_AFTER_DAYS - 1) * 86400000));

  const platform = range.map(emptyDay);
  const byUser = new Map();
  for (const u of users) {
    byUser.set(Number(u.id), {
      id: Number(u.id),
      name: u.name || '',
      email: u.email || '',
      team: u.team_name || '',
      team_id: u.team_id == null ? null : Number(u.team_id),
      joined_at: u.created_at || null,
      series: range.map(emptyDay),
      all_time: { confirmed: 0, failed: 0, skipped: 0 },
      last_confirmed_at: null,
      last_attempt_at: null
    });
  }

  for (const row of daily) {
    const i = index.get(String(row.day));
    const u = byUser.get(Number(row.user_id));
    if (i === undefined || !u) continue;
    const key = bucket(row.status);
    const n = Number(row.n) || 0;
    u.series[i][key] += n;
    platform[i][key] += n;
  }

  for (const row of totals) {
    const u = byUser.get(Number(row.user_id));
    if (!u) continue;
    u.all_time[bucket(row.status)] += Number(row.n) || 0;
    if (row.last_confirmed_at && (!u.last_confirmed_at || row.last_confirmed_at > u.last_confirmed_at)) u.last_confirmed_at = row.last_confirmed_at;
    if (row.last_attempt_at && (!u.last_attempt_at || row.last_attempt_at > u.last_attempt_at)) u.last_attempt_at = row.last_attempt_at;
  }

  const extByUser = new Map(extensions.map(e => [Number(e.user_id), e]));
  const companiesByTeam = new Map(companies.map(c => [Number(c.team_id), Number(c.n) || 0]));

  const list = [...byUser.values()].map(u => {
    const ext = extByUser.get(u.id) || {};
    const last7 = sumWindow(u.series, -7);
    const prev7 = sumWindow(u.series, -14, -7);
    const period = sumWindow(u.series, 0);
    let status = 'no_results';
    if (u.last_confirmed_at) status = String(u.last_confirmed_at).slice(0, 10) >= stallCutoff ? 'healthy' : 'stalled';
    return {
      ...u,
      companies: u.team_id == null ? 0 : (companiesByTeam.get(u.team_id) || 0),
      extension_version: ext.extension_version || null,
      extension_last_seen_at: ext.last_seen_at || null,
      period: { ...period, rate: rate(period.confirmed, period.failed) },
      last7: { ...last7, rate: rate(last7.confirmed, last7.failed) },
      prev7: { ...prev7, rate: rate(prev7.confirmed, prev7.failed) },
      trend: last7.confirmed - prev7.confirmed,
      all_time: { ...u.all_time, rate: rate(u.all_time.confirmed, u.all_time.failed) },
      status
    };
  }).sort((a, b) => b.period.confirmed - a.period.confirmed || b.all_time.confirmed - a.all_time.confirmed || a.name.localeCompare(b.name));

  const pTotal = sumWindow(platform, 0);
  const p7 = sumWindow(platform, -7);
  const pPrev7 = sumWindow(platform, -14, -7);
  let cumulative = 0;
  const platformSeries = platform.map(d => {
    cumulative += d.confirmed;
    return { ...d, cumulative_confirmed: cumulative, rate: rate(d.confirmed, d.failed) };
  });

  return {
    generated_at: new Date(today).toISOString(),
    days,
    range: { from: range[0], to: todayIso },
    stall_after_days: STALL_AFTER_DAYS,
    platform: {
      series: platformSeries,
      period: { ...pTotal, rate: rate(pTotal.confirmed, pTotal.failed) },
      last7: { ...p7, rate: rate(p7.confirmed, p7.failed) },
      prev7: { ...pPrev7, rate: rate(pPrev7.confirmed, pPrev7.failed) },
      users: list.length,
      healthy: list.filter(u => u.status === 'healthy').length,
      stalled: list.filter(u => u.status === 'stalled').length,
      no_results: list.filter(u => u.status === 'no_results').length,
      last_confirmed_at: list.reduce((m, u) => (u.last_confirmed_at && (!m || u.last_confirmed_at > m) ? u.last_confirmed_at : m), null)
    },
    users: list
  };
}

async function all(db, sql, ...binds) {
  const stmt = db.prepare(sql);
  const res = await (binds.length ? stmt.bind(...binds) : stmt).all();
  return res?.results || [];
}

export async function loadProgress(env, days, today = new Date()) {
  const since = `-${days - 1} days`;
  const db = env.DB;
  const [users, daily, totals, extensions, companies] = await Promise.all([
    all(db, `SELECT u.id, u.name, u.email, u.team_id, u.created_at, t.name AS team_name
             FROM users u LEFT JOIN teams t ON t.id = u.team_id`),
    all(db, `SELECT user_id, date(COALESCE(attempted_at, created_at)) AS day, status, COUNT(*) AS n
             FROM reposts
             WHERE date(COALESCE(attempted_at, created_at)) >= date('now', ?)
             GROUP BY user_id, day, status`, since),
    all(db, `SELECT user_id, status, COUNT(*) AS n,
                    MAX(CASE WHEN status = 'confirmed' THEN COALESCE(confirmed_at, attempted_at, created_at) END) AS last_confirmed_at,
                    MAX(COALESCE(attempted_at, created_at)) AS last_attempt_at
             FROM reposts GROUP BY user_id, status`),
    // last_seen_at / extension_version arrive with migration 0007; tolerate their absence.
    all(db, `SELECT user_id, MAX(last_seen_at) AS last_seen_at, MAX(extension_version) AS extension_version
             FROM extension_tokens WHERE revoked_at IS NULL GROUP BY user_id`).catch(() => []),
    all(db, `SELECT team_id, COUNT(*) AS n FROM companies WHERE enabled = 1 GROUP BY team_id`).catch(() => [])
  ]);
  return buildProgress({ users, daily, totals, extensions, companies, days, today });
}

// ---------------------------------------------------------------- HTTP route
// Self-contained so it can be mounted from worker.js without touching index.js.

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function sessionCookie(request) {
  const match = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const ADMIN_PROGRESS_PATH = '/api/admin/progress';

export async function handleAdminProgress(request, env, currentExtensionVersion = null) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const session = sessionCookie(request);
  if (!session) return json({ error: 'Not authenticated' }, 401);
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')`
  ).bind(await sha256Hex(session)).first();
  if (!user) return json({ error: 'Not authenticated' }, 401);
  // Team admins must not see other customers: only platform admins pass.
  if (!isPlatformAdmin(user, env)) return json({ error: 'Forbidden' }, 403);
  const days = clampDays(new URL(request.url).searchParams.get('days'));
  return json({ ...(await loadProgress(env, days)), current_extension_version: currentExtensionVersion });
}
