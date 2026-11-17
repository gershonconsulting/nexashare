import { collectPerformance } from './performance.js';
import { normalizeCounts } from './reporting.js';

const periodWhere = `user_id = ? AND datetime(COALESCE(attempted_at, created_at)) >= datetime(?) AND datetime(COALESCE(attempted_at, created_at)) < datetime(?)`;
export async function collectFailureEvidence(db, userId, from, until) {
  const rows = (await db.prepare(`SELECT COALESCE(NULLIF(trim(discovery_reason), ''), NULLIF(substr(trim(detail),1,180), ''), 'Reason not recorded') AS reason, COUNT(*) AS count
    FROM reposts WHERE ${periodWhere} AND status = 'failed' GROUP BY reason ORDER BY count DESC, reason LIMIT 10`).bind(userId, from, until).all()).results || [];
  return rows.map(row => ({ reason: String(row.reason), count: Number(row.count) }));
}

// Deterministic findings use full-period counts; they never infer engagement or causality.
export function buildFindings(data) {
  const findings = [], t = data.totals, health = data.run_health;
  if (t.failed) {
    const top = data.failures[0];
    findings.push({ id:'failures', priority:'Review first', title:'Find the main cause of failed attempts',
      evidence: top ? `${top.count} of ${t.failed} failed attempts: ${top.reason.replaceAll('_',' ')}.` : `${t.failed} failed attempts were recorded.`,
      implication:'These are historical attempt records, not a count of unresolved or distinct posts. Review LinkedIn before retrying uncertain outcomes.',
      action:'Review recent failed activity', href:'#reposts' });
  }
  if (health.no_activity_days) findings.push({ id:'gaps', priority:'Check coverage', title:'Some completed days have no recorded activity',
    evidence:`${health.no_activity_days} of ${health.completed_days} completed days have neither a run nor an outcome.`,
    implication:'This does not prove a missed schedule. Check the enabled sources, browser availability and configured frequency.', action:'Check extension health', href:'#extension' });
  if (data.coverage.enabled_without_activity) findings.push({ id:'sources', priority:'Check sources', title:'Enabled sources have no recorded outcomes',
    evidence:`${data.coverage.enabled_without_activity} enabled source${data.coverage.enabled_without_activity===1?'':'s'} have no recorded outcomes in the selected period.`,
    implication:'A source can be quiet, new, or not checked. No activity alone is not a failure.', action:'Review source coverage', href:'#summary' });
  const top = data.sources.filter(row=>row.confirmed).sort((a,b)=>b.confirmed-a.confirmed)[0];
  if (top && t.confirmed >= 5 && top.confirmed / t.confirmed >= .5) findings.push({id:'concentration', priority:'Content mix', title:'Publishing is concentrated in one source',
    evidence:`${top.source} accounts for ${top.confirmed} of ${t.confirmed} confirmed reposts (${Math.round(top.confirmed/t.confirmed*100)}%).`,
    implication:'This measures output concentration, not audience preference. Consider whether the mix matches your editorial goals.', action:'Explore source mix', href:'#summary'});
  if (t.confirmed && data.content.with_text < t.confirmed) findings.push({id:'content', priority:'Evidence quality', title:'Some confirmed reposts have no usable text',
    evidence:`${data.content.with_text} of ${t.confirmed} confirmed reposts have captured text.`,
    implication:'Topic recommendations are limited by the captured text. AI also samples at most 60 recent confirmed reposts.', action:'Review content evidence', href:'#intelligence'});
  if (!findings.length) findings.push({id:'steady',priority:'Next step',title:t.confirmed?'Keep reviewing your publishing mix':'Start with one controlled test',
    evidence:t.confirmed?`${t.confirmed} confirmed reposts and no failed attempts in the selected period.`:'No confirmed or failed attempts were recorded in the selected period.',
    implication:t.confirmed?'Reliable publishing is useful progress; it does not establish audience growth.':'Connect your browser and choose an enabled source before evaluating performance.',action:t.confirmed?'Review sources':'Check extension health',href:t.confirmed?'#summary':'#extension'});
  return findings;
}

export async function collectWorkspaceInsights(db, user, days = 30, date = new Date()) {
  const to = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1));
  const from = new Date(to); from.setUTCDate(from.getUTCDate()-days);
  const bounds = [user.id,from.toISOString(),to.toISOString()];
  const [performance,configured,outcomes,failures,versions,content,lastRun] = await Promise.all([
    collectPerformance(db,user.id,days,date),
    db.prepare(`SELECT id,name,vanity,enabled,created_at,'company' AS type FROM companies WHERE team_id = ?
      UNION ALL SELECT id,name,vanity,enabled,created_at,'person' AS type FROM people WHERE team_id = ?`).bind(user.team_id,user.team_id).all(),
    db.prepare(`SELECT COALESCE(source_type,'') AS type, COALESCE(source_id,'') AS source_id, COALESCE(source_vanity,'') AS vanity,
      COALESCE(NULLIF(trim(company_name),''),'Unknown source') AS source,
      SUM(status='confirmed') AS confirmed, SUM(status='failed') AS failed,
      SUM(status='skipped') AS skipped, SUM(status='already_reposted') AS already_reposted,
      MAX(datetime(COALESCE(attempted_at,created_at))) AS last_activity
      FROM reposts WHERE ${periodWhere} GROUP BY type,source_id,vanity,source`).bind(...bounds).all(),
    collectFailureEvidence(db,...bounds),
    db.prepare(`SELECT COALESCE(NULLIF(trim(extension_version),''),'Unknown version') AS version,
      SUM(status='confirmed') AS confirmed,SUM(status='failed') AS failed FROM reposts
      WHERE ${periodWhere} GROUP BY version ORDER BY confirmed+failed DESC,version`).bind(...bounds).all(),
    db.prepare(`SELECT SUM(CASE WHEN trim(COALESCE(post_text,''))<>'' THEN 1 ELSE 0 END) AS with_text
      FROM reposts WHERE ${periodWhere} AND status='confirmed'`).bind(...bounds).first(),
    db.prepare(`SELECT MAX(datetime(created_at)) AS last_run FROM extension_runs WHERE user_id = ? AND datetime(created_at) < datetime(?)`).bind(user.id,to.toISOString()).first()
  ]);
  const sources = (configured.results || []).filter(row=> !row.created_at || new Date(/Z$|[+-]\d\d:\d\d$/.test(row.created_at)?row.created_at:row.created_at.replace(' ','T')+'Z') < to).map(row=>({
    key:`${row.type}:${row.id}`,source:row.name,type:row.type,id:String(row.id),vanity:row.vanity,configured:true,enabled:Boolean(row.enabled),confirmed:0,failed:0,skipped:0,already_reposted:0,last_activity:null
  }));
  const norm = value=>String(value||'').trim().toLowerCase();
  for (const row of outcomes.results || []) {
    let match = row.type && row.source_id ? sources.find(s=>s.type===row.type && s.id===String(row.source_id)) : null;
    if (!match && row.vanity) match=sources.find(s=>norm(s.vanity)===norm(row.vanity)&&(!row.type||s.type===row.type));
    if (!match && !row.source_id && !row.vanity) { const names=sources.filter(s=>norm(s.source)===norm(row.source)&&(!row.type||s.type===row.type)); if(names.length===1)match=names[0]; }
    if (!match) { const key=`historical:${row.type}:${row.source_id}:${row.vanity}:${row.source}`; match=sources.find(s=>s.key===key); if(!match){match={key,source:row.source,type:row.type||'historical',configured:false,enabled:false,confirmed:0,failed:0,skipped:0,already_reposted:0,last_activity:null};sources.push(match);} }
    for(const key of ['confirmed','failed','skipped','already_reposted'])match[key]+=Number(row[key]||0);
    if(row.last_activity && (!match.last_activity||row.last_activity>match.last_activity))match.last_activity=row.last_activity;
  }
  for(const row of sources){Object.assign(row,normalizeCounts({...row,processed:row.confirmed+row.failed+row.skipped+row.already_reposted}));row.share=performance.totals.confirmed?Math.round(row.confirmed/performance.totals.confirmed*1000)/10:null;}
  sources.sort((a,b)=>b.confirmed-a.confirmed||b.failed-a.failed||a.source.localeCompare(b.source));
  const completed=performance.daily.filter(row=>!row.partial);
  const data={...performance,sources,source_limit:null,generated_at:date.toISOString(),
    coverage:{configured:sources.filter(s=>s.configured).length,enabled:sources.filter(s=>s.configured&&s.enabled).length,enabled_without_activity:sources.filter(s=>s.configured&&s.enabled&&!s.processed).length},
    failures,versions:(versions.results||[]).map(row=>({...row,...normalizeCounts(row)})),
    content:{with_text:Number(content?.with_text||0),confirmed:performance.totals.confirmed},
    run_health:{last_run:lastRun?.last_run||null,completed_days:completed.length,no_activity_days:completed.filter(row=>!row.runs&&!row.processed).length,quiet_days:completed.filter(row=>row.runs&&!row.processed).length,active_days:completed.filter(row=>row.runs||row.processed).length},
    source_coverage_note:'Configured companies and people are included even without outcomes. Historical or unconfigured sources are shown separately; no activity is not proof of a missed check.'};
  data.findings=buildFindings(data);
  return data;
}
