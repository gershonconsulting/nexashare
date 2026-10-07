import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { collectDailySeries, collectDaySummary, rate } from '../src/reporting.js';
import { getReferralDashboard, attributeReferral, verifyStripeSignature, handleReferralPayment } from '../src/referrals.js';
import { getIntelligence, AI_MODEL } from '../src/intelligence.js';
import app from '../src/index.js';
import { buildDailyReport } from '../src/worker.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, team_id INTEGER, created_at TEXT);
  CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE sessions (token_hash TEXT, user_id INTEGER, revoked_at TEXT, expires_at TEXT);
  CREATE TABLE oauth_states (state_hash TEXT, team_name TEXT, expires_at TEXT, used_at TEXT);
  CREATE TABLE reposts (id INTEGER PRIMARY KEY, user_id INTEGER, team_id INTEGER, company_name TEXT, status TEXT, attempted_at TEXT, confirmed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, post_text TEXT, hashtags TEXT, original_post_url TEXT, repost_url TEXT);
  CREATE TABLE extension_runs (user_id INTEGER, created_at TEXT);`);
sqlite.exec(readFileSync(new URL('../migrations/0013_growth_intelligence.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { const result = statement.run(...args); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
    };
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
};
sqlite.exec(`INSERT INTO users VALUES (1,'One','one@example.com',1,datetime('now','-60 days')),
  (2,'Two','two@example.com',2,datetime('now')), (3,'Three','three@example.com',3,datetime('now')),
  (4,'Same email','ONE@example.com',4,datetime('now'));
  INSERT INTO teams VALUES (1,'Team one'),(2,'Team two');`);
const insert = sqlite.prepare(`INSERT INTO reposts (user_id, team_id, company_name, status, attempted_at, post_text, original_post_url)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
for (let i = 0; i < 140; i++) insert.run(1,1,'Acme',i < 105 ? 'confirmed' : 'failed','2026-10-06T23:59:59Z','Example #AI https://untrusted.example','https://www.linkedin.com/feed/update/1');
insert.run(1,1,'Acme','skipped','2026-10-06T12:00:00Z','','');
insert.run(1,1,'Acme','already_reposted','2026-10-06T12:00:00Z','','');
insert.run(2,2,'Secret other account','confirmed','2026-10-06T12:00:00Z','SECRET OTHER ACCOUNT','');
insert.run(1,1,'Today','failed','2026-10-07T00:00:00Z','','');
sqlite.exec("INSERT INTO extension_runs VALUES(1,'2026-10-05T00:00:00Z')");
const series = await collectDailySeries(db,1,7,new Date('2026-10-07T10:00:00Z'));
assert.equal(series.daily.length,7);
assert.equal(series.daily[5].confirmed,105);
assert.equal(series.daily[5].success_rate,75);
assert.equal(series.daily[5].skipped,1);
assert.equal(series.daily[4].status,'quiet');
assert.equal(series.daily[0].status,'no_run');
assert.equal(series.daily[0].success_rate,null);
assert.equal(series.daily[6].partial,true);
assert.equal(series.totals.confirmed,105,'other accounts are excluded');
assert.equal(rate(0,1),0); assert.equal(rate(0,0),null);
const week = await collectDailySeries(db,1,7,new Date('2026-10-07T06:00:00Z'),false);
assert.equal(week.to,'2026-10-06'); assert.equal(week.totals.failed,35,'exclusive upper boundary');

// Daily email metrics use all outcomes, while details remain a bounded list.
sqlite.exec("UPDATE reposts SET attempted_at = datetime('now','-1 day') WHERE user_id=1 AND company_name='Acme'");
const summary = await collectDaySummary(db,1,'-1 day');
assert.equal(summary.confirmed,105); assert.equal(summary.rate,75);
const daily = buildDailyReport({name:'One',email:'one@example.com'},[{status:'confirmed'}],[],{todaySummary:summary,ranYesterday:false,extensionVersion:'1.2.24'});
assert.match(daily.subject,/75% success/); assert.match(daily.subject,/105 successful, 35 failed/);
assert.doesNotMatch(daily.subject,/job did not run/,'recorded outcomes establish activity');

const user = {id:1,email:'one@example.com'};
const referral = await getReferralDashboard(db,user,false);
assert.match(referral.link,/\/r\/[a-f0-9]{24}$/);
await attributeReferral(db,2,referral.code);
await attributeReferral(db,2,referral.code);
await attributeReferral(db,1,referral.code);
await attributeReferral(db,4,referral.code);
await attributeReferral(db,3,'invalid');
const dashboard = await getReferralDashboard(db,user,false);
assert.equal(dashboard.registered,1,'unique attribution, no self/same-email referrals');
assert.equal(dashboard.activated,1); assert.equal(dashboard.reward_days,0,'reposting does not grant billing rewards');
assert.ok(!JSON.stringify(dashboard).includes('two@example.com'),'invitee email is private');

async function signature(body,secret,timestamp=Math.floor(Date.now()/1000)) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const result=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`)));
  return `t=${timestamp},v1=${[...result].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}
const payment = JSON.stringify({id:'evt_1',type:'checkout.session.completed',data:{object:{client_reference_id:'2',payment_status:'paid',amount_total:1000,customer_details:{email:'two@example.com'}}}});
const signed = await signature(payment,'test_secret');
assert.equal(await verifyStripeSignature(payment,signed,'test_secret'),true);
assert.equal(await verifyStripeSignature(payment+' ',signed,'test_secret'),false);
assert.equal(await verifyStripeSignature(payment,await signature(payment,'test_secret',1),'test_secret'),false);
const webhook = body => new Request('https://nexashare.com/api/referrals/stripe-webhook',{method:'POST',body,headers:{'Stripe-Signature':signed}});
for(let i=0;i<2;i++) assert.equal((await handleReferralPayment(webhook(payment),{DB:db,STRIPE_WEBHOOK_SECRET:'test_secret'})).status,200);
assert.equal((await getReferralDashboard(db,user,true)).reward_days,30,'retries never double credit');
assert.equal((await getReferralDashboard(db,{id:2},true)).reward_days,30,'both parties earn credit');
assert.equal((await handleReferralPayment(webhook(payment+' '),{DB:db,STRIPE_WEBHOOK_SECRET:'test_secret'})).status,400);

const authToken='test-session';
const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(authToken)))].map(x=>x.toString(16).padStart(2,'0')).join('');
sqlite.prepare("INSERT INTO sessions VALUES(?,1,NULL,datetime('now','+1 day'))").run(hash);
const request = path => new Request(`https://nexashare.com${path}`,{headers:{Cookie:`session=${authToken}`}});
for(const path of ['/api/referrals','/api/intelligence','/api/reporting/daily']) assert.equal((await app.fetch(new Request('https://nexashare.com'+path),{DB:db})).status,401);
assert.equal((await app.fetch(request('/api/reporting/daily?days=10000'),{DB:db})).status,400);
const subscription=await (await app.fetch(request('/api/subscription'),{DB:db})).json();
assert.equal(subscription.referral_bonus_days,30); assert.ok(subscription.days_remaining>=29,'expired trial gets new earned days');
assert.match(subscription.checkout_url,/client_reference_id=1/);
const redirect=await app.fetch(new Request(referral.link),{DB:db});
assert.equal(redirect.status,302); assert.match(redirect.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);
assert.equal((await app.fetch(new Request('https://nexashare.com/r/bad'),{DB:db})).status,404);

let aiCalls=0;
const env={DB:db,AI:{async run(model,input){aiCalls++; assert.equal(model,AI_MODEL); assert.match(input.messages[0].content,/untrusted DATA/); assert.doesNotMatch(input.messages[1].content,/SECRET OTHER ACCOUNT/); return {response:'Summary\n105 confirmed reposts.\nRecommendations\nReview the failed source.'};}}};
assert.equal((await getIntelligence({DB:db},user,7,true)).status,503);
const ai=await getIntelligence(env,user,7,true);
assert.match(ai.report.analysis,/Recommendations/); assert.equal(ai.evidence.sampled_posts,60);
const cached=await getIntelligence(env,user,7,true); assert.equal(cached.cached,true); assert.equal(aiCalls,1);
assert.equal((await getIntelligence(env,user,30,true)).status,429,'cross-period requests share a cooldown');
assert.equal((await getIntelligence(env,{id:3},7,true)).status,422,'empty data never triggers AI');
assert.equal(aiCalls,1);
console.log('Growth integration checks passed: SQL totals, boundaries, account isolation, referral attribution, signed rewards, AI cache and errors.');
