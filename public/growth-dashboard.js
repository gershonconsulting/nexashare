(() => {
  const $ = id => document.getElementById(id);
  const esc = value => escapeHtml(String(value ?? ''));
  const num = value => Number(value || 0);
  const percentage = value => value === null || value === undefined ? 'N/A' : `${value}%`;
  const stat = (label,value) => `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
  const card = (label,value,note) => `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><p class="stat-note">${esc(note)}</p></div>`;
  const activity = row => row.partial ? 'Today · in progress' : ({green:'Confirmed activity',orange:'Some failed attempts',red:'All attempts failed',quiet:'Run recorded · no outcomes',no_run:'No run or outcomes recorded'}[row.status] || 'Recorded activity');
  const comparisonText = d => `${d.comparison.label}. ${d.comparison.current_from}–${d.comparison.current_to} versus ${d.comparison.from}–${d.comparison.to} (UTC). Equal completed periods; today is excluded from comparisons and included in totals.`;
  const statusText = d => `${d.from}–${d.to} UTC dates · Updated ${fmt(d.generated_at || new Date().toISOString())} (device time) · Today is in progress`;
  const finding = f => `<article class="finding"><span class="finding-priority">${esc(f.priority)}</span><h4>${esc(f.title)}</h4><p class="finding-evidence">${esc(f.evidence)}</p><p class="muted">${esc(f.implication)}</p><a class="finding-action" href="${['#reposts','#extension','#summary','#intelligence','#companies'].includes(f.href)?f.href:'#reposts'}" data-workspace-view="${['reposts','extension','summary','intelligence','companies'].includes(f.href?.slice(1))?f.href.slice(1):'reposts'}">${esc(f.action)} &rarr;</a></article>`;
  const requests = {dashboard:0,summary:0,reporting:0,intelligence:0};
  let reportSnapshot = null;
  async function workspace(view,period,render,message,clear) {
    const id=++requests[view]; $(message).textContent='Loading recorded evidence…'; clear?.();
    try { const d=await api(`/api/workspace-insights?days=${$(period).value}`); if(id!==requests[view])return; render(d); $(message).textContent=statusText(d); }
    catch(error){if(id===requests[view]){$(message).textContent=`This view could not load. ${error.message}`;clear?.();if(view==='summary')$('briefingTitle').textContent='Briefing unavailable';}}
  }
  window.renderEvidencePulse=d=>{const t=d.totals,h=d.run_health||{};$('accountPulse').className='account-pulse '+(t.failed?'warning':t.confirmed?'active':'warning');$('accountPulseTitle').textContent=t.confirmed?'Your account has confirmed publishing activity':'No confirmed publishing in this period';$('accountPulseMessage').textContent=String(t.confirmed)+' confirmed shares across your account; '+String(t.failed)+' failed attempts recorded.';$('accountPulseDetail').textContent=h.last_run?'Last account run: '+fmt(h.last_run):'No account run recorded';};
  function clearDashboard(){for(const id of ['summaryCards','timelineChart','mixChart','dashboardActions'])$(id).innerHTML='';$('performanceNext').textContent='';}
  window.loadPerformance=()=>workspace('dashboard','range',d=>{
    const t=d.totals, health=d.run_health||{}, findings=d.findings||[];window.workspaceSnapshot=d;window.renderEvidencePulse(d);
    $('summaryCards').innerHTML=card('Confirmed shares',t.confirmed,'LinkedIn-confirmed repost records')+card('Change in shares',d.comparison.percent===null?(d.comparison.current?'New activity':'No change'):`${d.comparison.percent>0?'+':''}${d.comparison.percent}%`,`${d.comparison.current} vs ${d.comparison.previous}; completed days`)+card('Publishing reliability',percentage(t.success_rate),`${t.confirmed} confirmed / ${t.attempts} attempts`)+card('Failed attempts',t.failed,'Historical records; not an unresolved queue');
    $('performanceNext').textContent=`Last recorded run: ${health.last_run?fmt(health.last_run):'none recorded'}. Review these findings before making changes.`;
    $('dashboardActions').innerHTML=findings.slice(0,3).map(finding).join('');
    $('timelineSummary').textContent=`${d.from}–${d.to} UTC`;
    const max=Math.max(1,...d.daily.map(row=>row.confirmed));
    $('timelineChart').innerHTML=d.daily.map(row=>`<button type="button" class="bar-wrap" data-day="${esc(row.day)}" title="${esc(row.day)}: ${num(row.confirmed)} confirmed; ${num(row.failed)} failed${row.partial?'; today in progress':''}"><div class="bar" style="height:${row.confirmed?Math.max(3,row.confirmed/max*155):0}px;opacity:${row.partial ? 0.5 : 1}"></div><span>${esc(row.day.slice(5))}</span></button>`).join('');
    $('mixChart').innerHTML=`<div class="outcome-stack">${[['Confirmed',t.confirmed,'Visibly confirmed by LinkedIn'],['Failed',t.failed,'An attempt did not get confirmation'],['Skipped',t.skipped,'Not attempted; inspect the recorded reason'],['Already reposted',t.already_reposted,'Not a new successful share']].map(([name,count,copy])=>`<div><strong>${num(count)}</strong><span><b>${name}</b><small>${copy}</small></span></div>`).join('')}</div>`;
  },'performanceMessage',clearDashboard);
  function clearSummary(){for(const id of ['companySummary','briefingFacts','summaryChanges','summaryCoverage'])$(id).innerHTML='';$('briefingTitle').textContent='Preparing your briefing…';$('briefingCopy').textContent='';$('sourceCoverageNote').textContent='';}
  window.loadSourceSummary=()=>workspace('summary','summaryPeriod',d=>{
    const t=d.totals,c=d.coverage||{},health=d.run_health||{},top=d.sources.find(s=>s.confirmed>0);
    $('briefingTitle').textContent=d.comparison.label;
    $('briefingCopy').textContent=`${t.confirmed} shares were confirmed from ${t.attempts} attempts. ${t.failed?`${t.failed} attempts failed; inspect their recorded reasons before retrying.`:'No failed attempts were recorded.'} ${top?`${top.source} produced the most confirmed shares. This is a publishing-volume ranking.`:'There are no confirmed shares to rank.'}`;
    $('briefingFacts').innerHTML=card('Share of leading source',top?percentage(top.share):'N/A','Confirmed output; not engagement')+card('Enabled without outcomes',num(c.enabled_without_activity),'Quiet, new or unchecked; review evidence')+card('Days with activity',`${num(health.active_days)} / ${num(health.completed_days)}`,'Completed days with a run or outcome');
    $('summaryChanges').innerHTML=`<p>${esc(comparisonText(d))}</p><p class="muted">${num(d.comparison.current)} confirmed shares versus ${num(d.comparison.previous)}. This measures repost volume, not audience growth.</p>`;
    $('summaryCoverage').innerHTML=`<p><strong>${num(c.enabled)}</strong> enabled companies and people, of <strong>${num(c.configured)}</strong> configured.</p><p>${num(c.enabled_without_activity)} enabled sources have no recorded outcomes. ${num(health.quiet_days)} completed days have a run but no outcomes; ${num(health.no_activity_days)} have neither.</p><p class="muted">Run frequency and new-post availability must be checked before calling a day missed.</p>`;
    $('companySummary').innerHTML=d.sources.length?d.sources.map(s=>`<tr><td><strong>${esc(s.source)}</strong><small class="table-sub">${esc(s.type||'Historical source')}</small></td><td>${s.configured?(s.enabled?'Enabled':'Paused'):'Historical / unmatched'}</td><td>${num(s.confirmed)}</td><td>${num(s.failed)}</td><td>${percentage(s.success_rate)}</td><td>${percentage(s.share)}</td><td>${s.last_activity?esc(fmt(s.last_activity)):'No recorded outcome'}</td></tr>`).join(''):'<tr><td colspan="7">No configured sources or recorded outcomes for this period.</td></tr>';
    $('sourceCoverageNote').textContent=d.source_coverage_note||'Source activity measures publishing volume, not engagement.';
  },'sourceSummaryMessage',clearSummary);
  function clearReport(){reportSnapshot=null;$('exportReport').disabled=true;for(const id of ['reportingTotals','dailySuccessRows','successChart','reportFailures','reportVersions'])$(id).innerHTML='';$('reportGrowth').textContent='';$('proofOfConceptProgress').textContent='';}
  function loadReporting(){return workspace('reporting','reportingPeriod',d=>{
    reportSnapshot=d;const t=d.totals,goal=d.proof_of_concept;$('exportReport').disabled=false;
    $('reportGrowth').textContent=comparisonText(d);
    $('reportingTotals').innerHTML=card('Confirmed shares',t.confirmed,'Full selected period')+card('Attempts',t.attempts,`${t.failed} failed; skips excluded`)+card('Reliability',percentage(t.success_rate),'Weighted by all attempts')+card('Skipped / already shared',t.skipped+t.already_reposted,'Excluded from reliability');
    $('proofOfConceptProgress').textContent=goal?.attempts?`Target ${goal.target_percent}% · ${percentage(goal.success_rate)} across ${goal.attempts} completed-day attempts. Today excluded. Access remains free.`:'No attempts on completed days. Access remains free.';
    $('dailySuccessRows').innerHTML=[...d.daily].reverse().map(row=>`<tr><td>${esc(row.day)}${row.partial?' *':''}</td><td>${num(row.confirmed)}</td><td>${num(row.failed)}</td><td>${num(row.skipped)}</td><td>${num(row.already_reposted)}</td><td>${percentage(row.success_rate)}</td><td>${activity(row)}</td></tr>`).join('');
    $('successChart').innerHTML=d.daily.map(row=>`<div class="daily-volume"><span>${esc(row.day.slice(5))}${row.partial?' *':''}</span><div class="volume-track"><i class="volume-confirmed" style="width:${row.attempts?row.confirmed/row.attempts*100:0}%"></i><i class="volume-failed" style="width:${row.attempts?row.failed/row.attempts*100:0}%"></i></div><b>${percentage(row.success_rate)}</b><small>${num(row.attempts)} attempts</small></div>`).join('');
    const failures=d.failures||[];$('reportFailures').innerHTML=failures.length?failures.map(f=>`<div class="failure-row"><strong>${num(f.count)}</strong><span>${esc(f.reason.replaceAll('_',' '))}</span></div>`).join(''):'<p class="muted">No failed attempts in this period.</p>';
    $('reportVersions').innerHTML=`<table><thead><tr><th>Version</th><th>Attempts</th><th>Confirmed</th><th>Failed</th><th>Reliability</th></tr></thead><tbody>${(d.versions||[]).map(v=>`<tr><td>${esc(v.version)}</td><td>${num(v.attempts)}</td><td>${num(v.confirmed)}</td><td>${num(v.failed)}</td><td>${percentage(v.success_rate)}</td></tr>`).join('')||'<tr><td colspan="5">No versioned outcome records.</td></tr>'}</tbody></table>`;
  },'reportingMessage',clearReport);}
  async function loadReferrals() {
    $('referralMessage').textContent = 'Loading your referral program…';
    try {
      const data = await api('/api/referrals');
      $('referralLink').value = data.link;
      $('copyReferral').disabled = false;
      $('referralRules').textContent = data.reward_rule;
      $('referralBilling').textContent = data.billing_configured ? 'Paid conversions are verified before bonus days are credited.' : 'Signup and activation tracking is active. Paid-conversion rewards are pending payment verification setup.';
      $('referralTotals').innerHTML = stat('Registered', data.registered) + stat('Activated', data.activated) + stat('Paid conversions', data.converted) + stat('Bonus days earned', data.reward_days);
      $('referralRows').innerHTML = data.referrals.length ? data.referrals.map((row, i) => `<tr><td>Referral ${data.referrals.length - i}</td><td>${escapeHtml(fmt(row.registered_at))}</td><td>${escapeHtml(row.status)}</td><td>${row.converted_at ? '30 bonus days credited' : 'Pending paid conversion'}</td></tr>`).join('') : '<tr><td colspan="4">No referrals yet. Copy your link to get started.</td></tr>';
      $('referralMessage').textContent = '';
    } catch (error) { $('referralMessage').textContent = error.message; }
  }
  let intelligenceRequest=0;
  function showAnalysis(data){
    $('intelligenceResult').hidden=!data.report;
    $('intelligenceAnalysis').textContent=data.report?.analysis||'';
    $('intelligenceDate').textContent=data.report?`Saved AI snapshot · Generated ${fmt(data.report.generated_at)} · It is not refreshed automatically. A new request may reuse a snapshot less than one hour old.`:'';
  }
  async function loadIntelligence(generate=false){
    const id=++intelligenceRequest,days=$('intelligencePeriod').value;
    $('intelligenceMessage').textContent=generate?'Analyzing captured content and failure evidence…':'Loading your saved content review…';$('generateIntelligence').disabled=true;$('intelligenceResult').hidden=true;
    try{const data=await api(`/api/intelligence?days=${days}`,generate?{method:'POST'}:undefined);if(id!==intelligenceRequest)return;showAnalysis(data);$('intelligenceMessage').textContent=data.report?'AI suggestions are based on the evidence available at generation time.':data.configured?'A content review is optional. Use the evidence-backed priorities above or generate a review.':'AI content review is unavailable. Operational findings above still work.';}
    catch(e){if(id===intelligenceRequest)$('intelligenceMessage').textContent=e.message;}
    finally{if(id===intelligenceRequest)$('generateIntelligence').disabled=false;}
  }
  function loadIntelligencePage(){
    loadIntelligence();
    return workspace('intelligence','intelligencePeriod',d=>{
      $('intelligenceFindings').innerHTML=(d.findings||[]).map(finding).join('');
      $('intelligenceEvidence').innerHTML=card('Recorded outcomes',d.totals.processed,'Full-period counts')+card('Confirmed with captured text',`${num(d.content?.with_text)} / ${num(d.totals.confirmed)}`,'Text coverage for content analysis')+card('AI sample limit','60 posts','Most recent confirmed reposts');
    },'intelligenceEvidenceMessage',()=>{for(const id of ['intelligenceFindings','intelligenceEvidence'])$(id).innerHTML='';});
  }
  const loaders={dashboard:window.loadPerformance,summary:window.loadSourceSummary,reporting:loadReporting,referral:loadReferrals,intelligence:loadIntelligencePage};
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>loaders[button.dataset.view]?.()));
  $('reportingPeriod').addEventListener('change',loadReporting);$('summaryPeriod').addEventListener('change',window.loadSourceSummary);$('intelligencePeriod').addEventListener('change',loadIntelligencePage);$('generateIntelligence').addEventListener('click',()=>loadIntelligence(true));
  for(const view of ['dashboard','summary','reporting','intelligence'])$(`view-${view}`).addEventListener('click',e=>{const link=e.target.closest('[data-workspace-view]');if(!link)return;e.preventDefault();const button=[...document.querySelectorAll('[data-view]')].find(b=>b.dataset.view===link.dataset.workspaceView);button?.click();if(link.dataset.workspaceView==='reposts'){$('outcomeFilter').value='failed';$('companyFilter').value='all';if(typeof renderReposts==='function')renderReposts();}});
  $('timelineChart').addEventListener('click',e=>{const bar=e.target.closest('[data-day]');if(!bar)return;$('timelineSummary').textContent=bar.title;});
  $('exportReport').addEventListener('click',()=>{
    if(!reportSnapshot)return;
    const rows=[['Date (UTC)','Confirmed','Failed','Skipped','Already reposted','Attempts','Success percent','Activity'],...reportSnapshot.daily.map(d=>[d.day,d.confirmed,d.failed,d.skipped,d.already_reposted,d.attempts,d.success_rate??'',activity(d)])];
    const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`nexashare-${reportSnapshot.from}-${reportSnapshot.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('printReport').addEventListener('click',()=>window.print());
  $('copyReferral').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('referralLink').value);$('referralMessage').textContent='Referral link copied.';}catch{$('referralLink').select();$('referralMessage').textContent='Select and copy your referral link.';}});
  window.addEventListener?.('hashchange',()=>{const route=location.hash.slice(1)||'dashboard';if(typeof selectView==='function')selectView(route);return loaders[route]?.();});
  loaders[location.hash.slice(1)]?.();
})();
