const CODE = /^[a-f0-9]{24}$/;
export function referralCode(value) { return CODE.test(String(value || '')) ? value : null; }

export async function getReferralDashboard(db, user, billingConfigured) {
  const code = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
  await db.prepare('INSERT OR IGNORE INTO referral_codes (user_id, code) VALUES (?, ?)').bind(user.id, code).run();
  const stored = await db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').bind(user.id).first();
  const result = await db.prepare(`SELECT r.id, r.registered_at, r.converted_at,
    EXISTS(SELECT 1 FROM reposts p WHERE p.user_id = r.referred_user_id AND p.status = 'confirmed') AS activated
    FROM referrals r WHERE r.referrer_id = ? ORDER BY r.registered_at DESC`).bind(user.id).all();
  const rewards = await db.prepare('SELECT COALESCE(SUM(days), 0) AS days FROM referral_rewards WHERE user_id = ?').bind(user.id).first();
  const rows = result.results || [];
  return {
    code: stored.code, link: `https://nexashare.com/r/${stored.code}`,
    registered: rows.length, activated: rows.filter(row => row.activated).length,
    converted: rows.filter(row => row.converted_at).length, reward_days: Number(rewards?.days || 0),
    billing_configured: billingConfigured,
    reward_rule: 'You and your referral earn 30 bonus days after their first verified paid conversion. Each new account can be referred once. Self-referrals are excluded.',
    referrals: rows.map(row => ({ ...row, status: row.converted_at ? 'converted' : row.activated ? 'activated' : 'registered' }))
  };
}

export async function attributeReferral(db, userId, code) {
  if (!referralCode(code)) return;
  await db.prepare(`INSERT OR IGNORE INTO referrals (referrer_id, referred_user_id)
    SELECT c.user_id, ? FROM referral_codes c WHERE c.code = ? AND c.user_id <> ?
    AND NOT EXISTS(SELECT 1 FROM users a JOIN users b ON lower(trim(a.email)) = lower(trim(b.email))
      WHERE a.id = c.user_id AND b.id = ?)`)
    .bind(userId, code, userId, userId).run();
}

// Only a Stripe-signed paid Checkout event can create rewards. A dashboard
// request, registration, or extension outcome can never grant billing credit.
export async function verifyStripeSignature(body, signature, secret, now = Date.now()) {
  if (!secret || !signature) return false;
  const fields = signature.split(',').map(part => part.split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
  const hex = [...mac].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return fields.filter(([key]) => key === 'v1').some(([, value]) => {
    if (!/^[a-f0-9]{64}$/.test(value || '')) return false;
    let difference = 0;
    for (let i = 0; i < hex.length; i++) difference |= hex.charCodeAt(i) ^ value.charCodeAt(i);
    return difference === 0;
  });
}

export async function handleReferralPayment(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return Response.json({ error: 'Payment verification is not configured' }, { status: 503 });
  const body = await request.text();
  if (!await verifyStripeSignature(body, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Invalid payment signature' }, { status: 400 });
  }
  let event;
  try { event = JSON.parse(body); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const session = event.data?.object || {};
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) || session.payment_status !== 'paid') return Response.json({ received: true });
  const userId = Number(session.client_reference_id);
  const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
  if (!event.id || !Number.isSafeInteger(userId) || userId <= 0 || !email || Number(session.amount_total || 0) <= 0) return Response.json({ received: true, credited: false });
  const referral = await env.DB.prepare(`SELECT r.id, r.referrer_id, r.referred_user_id FROM referrals r
    JOIN users u ON u.id = r.referred_user_id WHERE r.referred_user_id = ? AND lower(trim(u.email)) = ?`).bind(userId, email).first();
  if (!referral) return Response.json({ received: true, credited: false });
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO referral_payment_events (event_id) VALUES (?)').bind(event.id),
    env.DB.prepare("UPDATE referrals SET converted_at = COALESCE(converted_at, datetime('now')) WHERE id = ?").bind(referral.id),
    env.DB.prepare('INSERT OR IGNORE INTO referral_rewards (referral_id, user_id, days) VALUES (?, ?, 30)').bind(referral.id, referral.referrer_id),
    env.DB.prepare('INSERT OR IGNORE INTO referral_rewards (referral_id, user_id, days) VALUES (?, ?, 30)').bind(referral.id, referral.referred_user_id)
  ]);
  return Response.json({ received: true, credited: true });
}
