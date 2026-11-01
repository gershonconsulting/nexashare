import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { collectPerformance, growth, performanceNarrative } from '../src/performance.js';
import app from '../src/index.js';
import { buildDailyReport } from '../src/worker.js';
import { buildWeeklyUserEmail, buildWeeklyAdminEmail } from '../src/weekly-report.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE reposts (user_id INTEGER, company_name TEXT, status TEXT, attempted_at TEXT, created_at TEXT);
  CREATE TABLE extension_runs (user_id INTEGER, created_at TEXT);
  CREATE TABLE users (id INTEGER, name TEXT, email TEXT, team_id INTEGER);
  CREATE TABLE teams (id INTEGER, name TEXT);
  CREATE TABLE sessions (token_hash TEXT, user_id INTEGER, revoked_at TEXT, expires_at TEXT);
  INSERT INTO users VALUES(1, 'Test', 'test@example.com', 1);`);
const db = { prepare(sql) { let args=[]; const s=sqlite.prepare(sql); return {
  bind(...values) { args=values; return this; },
  async all() { return { results:s.all(...args) }; }, async first() { return s.get(...args) || null; }
}; } };
const insert=sqlite.prepare('INSERT INTO reposts VALUES(?,?,?,?,?)');
for(let i=0;i<150;i++) insert.run(1,'Company', i<120?'confirmed':'failed','2026-10-31 23:59:59',null);
for(let i=0;i<60;i++) insert.run(1,'Person','confirmed','2026-10-25T12:00:00Z',null);
insert.run(1,'Skipped','skipped',null,'2026-10-30T12:00:00Z');
insert.run(1,'Skipped','already_reposted','2026-10-30T12:00:00Z',null);
insert.run(1,'Today','confirmed','2026-11-01T00:00:00Z',null);
insert.run(2,'Private source','confirmed','2026-10-31T12:00:00Z',null);
insert.run(1,'Future','confirmed','2026-11-02T00:00:00Z',null);
const date=new Date('2026-11-01T12:00:00Z');
const data=await collectPerformance(db,1,7,date);
assert.equal(data.totals.confirmed,121,'not limited to latest 100');
assert.equal(data.totals.failed,30);
assert.equal(data.totals.success_rate,80.1);
assert.equal(data.comparison.current,120,'today excluded');
assert.equal(data.comparison.previous,60,'previous equal period includes its last day');
assert.equal(data.comparison.percent,100);
assert.equal(data.comparison.from,'2026-10-20');
assert.equal(data.comparison.to,'2026-10-25');
assert.equal(data.comparison.current_from,'2026-10-26');
assert.equal(data.comparison.current_to,'2026-10-31');
assert.equal(data.sources[0].confirmed,120);
assert.equal(data.sources[0].success_rate,80);
assert.equal(data.sources.find(row=>row.source==='Skipped').success_rate,null);
assert.equal(data.engagement.reactions,null);
assert.equal(data.engagement.available,false);
assert.doesNotMatch(JSON.stringify(data),/Private source|Future/);
assert.match(data.narrative,/30 failed attempts/);
const week=await collectPerformance(db,1,7,date,false);
assert.equal(week.totals.confirmed,180);
assert.equal(week.to,'2026-10-31');
assert.equal(week.comparison.days,7);
assert.equal(growth(2,0).percent,null);
assert.match(growth(2,0).label,/New activity/);
assert.match(growth(0,0).label,/No confirmed/);
assert.equal(growth(0,10).percent,-100);
assert.equal((await collectPerformance(db,99,30,date)).totals.success_rate,null);
assert.match(performanceNarrative({confirmed:0,failed:0}),/Check your monitored sources/);

const token='performance-test-session';
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
sqlite.prepare("INSERT INTO sessions VALUES(?,1,NULL,datetime('now','+1 day'))").run(hash);
const request=(query='',method='GET',authenticated=true)=>new Request(`https://nexashare.com/api/performance${query}`,{method,headers:authenticated?{Cookie:`session=${token}`}:{}});
assert.equal((await app.fetch(request('', 'GET',false),{DB:db})).status,401);
assert.equal((await app.fetch(request('?days=999'),{DB:db})).status,400);
assert.equal((await app.fetch(request('', 'POST'),{DB:db})).status,405);
assert.equal((await app.fetch(request('?days=7'),{DB:db})).status,200);

const daily=buildDailyReport({name:'Test'},[],[],{todaySummary:{confirmed:120,failed:30,processed:150,skipped:0},previousSummary:{confirmed:60,failed:0,processed:60,skipped:0}});
assert.match(daily.text,/\+100% vs previous period/);
assert.match(daily.html,/Data unavailable/);
const activity={confirmed:120,failed:30,skipped:2,previousTotals:{confirmed:60},extensionVersion:'1.2.29',runDays:7,outcomes:[]};
for(const email of [buildWeeklyUserEmail({name:'Test'},activity,'1.2.29',date),buildWeeklyAdminEmail([{name:'Test',...activity}],'1.2.29',date)]) {
  assert.match(email.text,/\+100% vs previous period/);
  assert.match(email.html,/Data unavailable/);
  assert.match(email.html,/Oct 31, 2026 \(UTC\)/,'exclusive end date not shown as included');
}

// Execute shipped browser code to verify stale responses and untrusted names.
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:'7',textContent:'',innerHTML:'',style:{},addEventListener(){}});return elements.get(id);};
const pending=[];
const context={document:{getElementById:element,querySelectorAll:()=>[]},window:{},location:{hash:''},escapeHtml:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),fmt:v=>String(v),api:()=>new Promise(resolve=>pending.push(resolve))};
vm.runInNewContext(readFileSync(new URL('../public/growth-dashboard.js',import.meta.url),'utf8'),context);
const old=context.window.loadPerformance(); const current=context.window.loadPerformance();
pending[1]({...data,totals:{...data.totals,confirmed:500}});await current;
pending[0](data);await old;
assert.match(element('summaryCards').innerHTML,/500/,'stale response cannot overwrite latest selection');
const source=context.window.loadSourceSummary();pending[2]({...data,sources:[{source:'<script>bad</script>',confirmed:1,failed:0,skipped:0,success_rate:100}]});await source;
assert.match(element('companySummary').innerHTML,/&lt;script&gt;/);
assert.doesNotMatch(element('companySummary').innerHTML,/<script>/);
console.log('Performance checks passed: complete SQL totals, UTC boundaries, equal periods, partial days, unavailable metrics, user isolation, endpoint auth, report comparisons, browser races and escaping.');
