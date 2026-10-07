(() => {
  const $ = id => document.getElementById(id);
  const percentage = value => value === null ? 'N/A' : `${value}%`;
  const stat = (label, value) => `<div class="stat"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
  const activity = row => row.partial ? 'Today · in progress' : ({ green: 'Successful', orange: 'Some failures', red: 'All attempts failed', quiet: 'Ran · no attempts', no_run: 'No activity recorded' }[row.status]);
  let reportingRequest = 0;
  async function loadReporting() {
    const requestId = ++reportingRequest;
    $('reportingMessage').textContent = 'Loading complete account totals…';
    try {
      const data = await api(`/api/reporting/daily?days=${$('reportingPeriod').value}`);
      if (requestId !== reportingRequest) return;
      const t = data.totals;
      const goal = data.proof_of_concept;
      const progress = $('proofOfConceptProgress');
      progress.className = 'notice' + (goal.attempts && !goal.target_met ? ' warning' : '');
      progress.textContent = goal.attempts
        ? `Proof-of-concept target: ${goal.target_percent}% · ${percentage(goal.success_rate)} across ${goal.attempts} attempts on completed reporting days (${goal.from} to ${goal.to}). ${goal.target_met ? 'Target reached for this period.' : `${goal.percentage_points_remaining} percentage points below target.`} Today is excluded. Access remains free.`
        : `Proof-of-concept target: ${goal.target_percent}% · No attempts on completed reporting days. Access remains free.`;
      $('reportingTotals').innerHTML = stat('Confirmed reposts', t.confirmed) + stat('Failed attempts', t.failed) + stat('Success rate', percentage(t.success_rate));
      $('dailySuccessRows').innerHTML = [...data.daily].reverse().map(row => `<tr><td>${row.day}${row.partial ? ' *' : ''}</td><td>${row.confirmed}</td><td>${row.failed}</td><td>${row.skipped}</td><td>${row.already_reposted}</td><td><b>${percentage(row.success_rate)}</b></td><td>${activity(row)}</td></tr>`).join('');
      const width = Math.max(650, data.daily.length * 35 + 50), height = 230, step = (width - 50) / data.daily.length;
      const svg = data.daily.map((row, i) => {
        const x = 45 + i * step, h = row.success_rate === null ? 0 : row.success_rate * 1.5;
        const colour = row.failed ? (row.confirmed ? '#d97706' : '#dc2626') : '#16a34a';
        return `<g><title>${row.day}: ${percentage(row.success_rate)}; ${row.confirmed} confirmed / ${row.failed} failed</title>${row.success_rate === null ? `<text x="${x + step / 2}" y="175" text-anchor="middle" font-size="10" fill="#667085">N/A</text>` : `<rect x="${x}" y="${170 - Math.max(2,h)}" width="${step - 6}" height="${Math.max(2,h)}" rx="3" fill="${colour}"/><text x="${x + (step - 6) / 2}" y="${160 - h}" text-anchor="middle" font-size="10">${row.success_rate}%</text>`}<text transform="translate(${x + step / 2},192) rotate(-35)" text-anchor="end" font-size="10">${row.day.slice(5)}</text></g>`;
      }).join('');
      $('successChart').innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily repost success percentages; the table below contains exact values"><line x1="40" y1="20" x2="${width}" y2="20" stroke="#e4e7ec"/><text x="0" y="24" font-size="11">100%</text><line x1="40" y1="57.5" x2="${width}" y2="57.5" stroke="#0a66c2" stroke-dasharray="5 4"/><text x="0" y="61" font-size="11" fill="#0a66c2">75%</text><line x1="40" y1="170" x2="${width}" y2="170" stroke="#e4e7ec"/><text x="10" y="174" font-size="11">0%</text>${svg}</svg>`;
      $('reportingMessage').textContent = `${data.from} to ${data.to} · ${t.attempts} attempts · skips excluded from success rate.`;
    } catch (error) { if (requestId === reportingRequest) $('reportingMessage').textContent = error.message; }
  }
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
  let intelligenceRequest = 0;
  function showAnalysis(data) {
    $('intelligenceResult').hidden = !data.report;
    $('intelligenceAnalysis').textContent = data.report?.analysis || '';
    $('intelligenceDate').textContent = data.report ? `Cloudflare AI · ${$('intelligencePeriod').value} days · Generated ${fmt(data.report.generated_at)}${data.cached ? ' · Saved analysis (refreshed hourly)' : ''}` : '';
  }
  async function loadIntelligence(generate = false) {
    const requestId = ++intelligenceRequest;
    const days = $('intelligencePeriod').value;
    $('intelligenceMessage').textContent = generate ? 'Cloudflare AI is analyzing your confirmed reposts…' : 'Loading saved analysis…';
    $('generateIntelligence').disabled = true;
    try {
      const data = await api(`/api/intelligence?days=${days}`, generate ? { method: 'POST' } : undefined);
      if (requestId !== intelligenceRequest) return;
      showAnalysis(data);
      $('intelligenceMessage').textContent = data.report ? (data.evidence ? `${data.evidence.sampled_posts} confirmed reposts sampled; totals cover ${data.evidence.from} to ${data.evidence.to}.` : '') : data.configured ? 'Choose Analyze my reposts to generate recommendations.' : 'Cloudflare AI is temporarily unavailable.';
    } catch (error) { if (requestId === intelligenceRequest) $('intelligenceMessage').textContent = error.message; }
    finally { if (requestId === intelligenceRequest) $('generateIntelligence').disabled = false; }
  }
  const loaders = { reporting: loadReporting, referral: loadReferrals, intelligence: () => loadIntelligence() };
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => loaders[button.dataset.view]?.()));
  $('reportingPeriod').addEventListener('change', loadReporting);
  $('intelligencePeriod').addEventListener('change', () => { $('intelligenceResult').hidden = true; loadIntelligence(); });
  $('generateIntelligence').addEventListener('click', () => loadIntelligence(true));
  $('copyReferral').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('referralLink').value); $('referralMessage').textContent = 'Referral link copied.'; }
    catch { $('referralLink').select(); $('referralMessage').textContent = 'Select and copy your referral link.'; }
  });
  loaders[location.hash.slice(1)]?.();
})();
