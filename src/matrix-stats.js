// POST /api/matrix-stats — read-only feed for the weekly "Client Platform Matrix" email
// (Supabase edge function `client-platform-matrix` in task.gershoncrm.com).
// Same contract as linalysis.net (functions/api/matrix-stats.js) and social.gershon.ai:
//
//   Request : {"secret":"…","people":[{"key":"…","company":"…","emails":["a@b.com"]}]}
//   Auth    : SHA-256 hex of `secret` must equal MATRIX_SECRET_SHA256 (only the hash is
//             committed). Mismatch -> 401 {"ok":false}. Non-POST -> 405.
//   Response: {"ok":true,"platform":"nexashare","results":[{"key","ok","note"}]}
//
// Matching: a person matches a NexaShare account when any of their emails equals
// users.email (case-insensitive). No domain or company fallback.
// ok   = true when a matching user account exists.
// note = "<N> reposts 30d", N = delivery_jobs of that user with status 'published' and
//        completed_at within the last 30 days (highest across matched accounts);
//        "no account" when no email matches. Reads only — no writes to D1.

export const MATRIX_STATS_PATH = '/api/matrix-stats';
const MATRIX_SECRET_SHA256 = '7031a38bde30c34db677585e85f696f51d78cc417e40d38572d20ebeb1c77569';
const MAX_PEOPLE = 500;
const MAX_EMAILS = 10;

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function lookup(db, emails) {
  const marks = emails.map(() => '?').join(', ');
  const { results = [] } = await db.prepare(
    `SELECT u.id,
            (SELECT COUNT(*) FROM delivery_jobs d
              WHERE d.user_id = u.id AND d.status = 'published'
                AND datetime(d.completed_at) >= datetime('now', '-30 days')) AS n
       FROM users u
      WHERE lower(u.email) IN (${marks})`
  ).bind(...emails).all();
  if (!results.length) return { ok: false, note: 'no account' };
  const n = Math.max(...results.map(r => Number(r.n || 0)));
  return { ok: true, note: `${n} reposts 30d` };
}

export async function handleMatrixStats(request, env) {
  if (request.method !== 'POST') return reply({ ok: false }, 405);
  let body;
  try { body = await request.json(); } catch { return reply({ ok: false }, 401); }
  const secret = typeof body?.secret === 'string' ? body.secret : '';
  if (!secret || (await sha256Hex(secret)) !== MATRIX_SECRET_SHA256) return reply({ ok: false }, 401);

  const people = Array.isArray(body.people) ? body.people.slice(0, MAX_PEOPLE) : [];
  const results = [];
  for (const p of people) {
    const key = p?.key != null ? String(p.key) : null;
    const emails = [...new Set((Array.isArray(p?.emails) ? p.emails : [])
      .map(e => String(e || '').trim().toLowerCase())
      .filter(e => e.includes('@')))].slice(0, MAX_EMAILS);
    if (!emails.length) { results.push({ key, ok: false, note: 'no account' }); continue; }
    try {
      results.push({ key, ...(await lookup(env.DB, emails)) });
    } catch (error) {
      console.error('matrix-stats lookup failed', { message: error?.message });
      results.push({ key, ok: false, note: 'lookup error' });
    }
  }
  return reply({ ok: true, platform: 'nexashare', results });
}
