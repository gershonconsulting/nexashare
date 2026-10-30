// POST /api/matrix-stats — read-only feed for the weekly "Client Platform Matrix" email
// (Supabase edge function `client-platform-matrix` in task.gershoncrm.com).
// Same contract as social.gershon.ai and linalysis.net:
//
//   Request : {"secret":"…","people":[{"key":"…","company":"…","emails":["a@b.com"]}]}
//   Auth    : SHA-256 hex of `secret` must equal MATRIX_SECRET_SHA256. Only the hash lives
//             here; the plain value is cc_health_config.matrix_stats_secret in the task
//             project. Mismatch -> 401 {"ok":false}. No new Worker secret is needed.
//   Response: {"ok":true,"platform":"nexashare","as_of":"<ISO>","results":[{"key","ok","note"}]}
//
// Matching: a person matches a NexaShare user by exact email (any of their emails), else
// by work-email domain (freemail ignored), else by team name == company.
// ok   = matched user whose extension reported in the last 14 days OR who has a
//        confirmed repost in the last 30 days.
// note = "N reposts 30d" (+ " · ext idle Xd" when the extension is quiet), "no user" when
//        unmatched. Reads only — no writes to D1.

export const MATRIX_STATS_PATH = '/api/matrix-stats';
const MATRIX_SECRET_SHA256 = '7031a38bde30c34db677585e85f696f51d78cc417e40d38572d20ebeb1c77569';
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.de', 'orange.fr', 'free.fr', 'wanadoo.fr', 'laposte.net']);
const DAY = 86400000;

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const lc = s => String(s || '').trim().toLowerCase();
const norm = s => lc(s).replace(/\b(ag|inc|llc|ltd|gmbh|sa|sas|srl|spa|corp|co)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
// D1 stores both "YYYY-MM-DD HH:MM:SS" (UTC) and ISO strings.
const ts = v => { if (!v) return NaN; const s = String(v); return Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); };

export async function handleMatrixStats(request, env) {
  if (request.method !== 'POST') return reply({ ok: false }, 405);
  let body;
  try { body = await request.json(); } catch { return reply({ ok: false }, 401); }
  const secret = typeof body?.secret === 'string' ? body.secret : '';
  if (!secret || (await sha256Hex(secret)) !== MATRIX_SECRET_SHA256) return reply({ ok: false }, 401);

  try {
    const people = Array.isArray(body.people) ? body.people.slice(0, 200) : [];
    const { results: users = [] } = await env.DB.prepare(
      `SELECT u.id, lower(u.email) AS email, t.name AS team,
              (SELECT MAX(COALESCE(e.last_seen_at, e.created_at)) FROM extension_tokens e
                 WHERE e.user_id = u.id AND e.revoked_at IS NULL) AS ext_seen,
              (SELECT MAX(x.created_at) FROM extension_runs x WHERE x.user_id = u.id) AS last_run,
              (SELECT COUNT(*) FROM reposts r WHERE r.user_id = u.id AND r.status = 'confirmed'
                 AND COALESCE(r.confirmed_at, r.created_at) >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-30 days')) AS rp30
         FROM users u LEFT JOIN teams t ON t.id = u.team_id`
    ).all();

    const byEmail = new Map(users.map(u => [u.email, u]));
    const now = Date.now();
    const results = people.map(p => {
      const key = String(p?.key ?? '');
      const emails = (Array.isArray(p?.emails) ? p.emails : []).map(lc).filter(Boolean);
      let u = emails.map(e => byEmail.get(e)).find(Boolean);
      if (!u) {
        const doms = emails.map(e => e.split('@')[1]).filter(d => d && !FREEMAIL.has(d));
        u = users.find(x => doms.includes(x.email.split('@')[1]));
      }
      if (!u && p?.company) {
        const c = norm(p.company);
        u = c.length >= 4 ? users.find(x => norm(x.team) === c) : null;
      }
      if (!u) return { key, ok: false, note: 'no user' };
      const seen = Math.max(ts(u.ext_seen) || 0, ts(u.last_run) || 0);
      const idleDays = seen ? Math.floor((now - seen) / DAY) : null;
      const rp = Number(u.rp30 || 0);
      const active = (idleDays !== null && idleDays <= 14) || rp > 0;
      let note = `${rp} reposts 30d`;
      if (idleDays === null) note += ' · ext never seen';
      else if (idleDays > 2) note += ` · ext idle ${idleDays}d`;
      return { key, ok: active, note };
    });
    return reply({ ok: true, platform: 'nexashare', as_of: new Date().toISOString(), results });
  } catch (error) {
    console.error('matrix-stats failed', { message: error?.message });
    return reply({ ok: false }, 500);
  }
}
