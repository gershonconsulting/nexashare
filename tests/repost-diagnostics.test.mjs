// Regression guard for failure telemetry and ingestion; run with Node 22.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAdminReportEmail } from '../src/admin-report.js';

const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const extension = await readFile(new URL('../chrome-extension/sync-core.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0017_repost_discovery_diagnostics.sql', import.meta.url), 'utf8');
const ingest = worker.slice(worker.indexOf("if (url.pathname === '/api/extension/ingest'"), worker.indexOf("if (url.pathname === '/api/extension/seen'"));
assert.ok(ingest.includes('const reportedVersion ='), 'version must be defined inside ingest handler');
assert.ok(ingest.indexOf('const reportedVersion =') < ingest.indexOf('for (const outcome of outcomes)'), 'version must be defined before use');
assert.match(ingest, /outcome\.diagnostic\?\.discoveryRoute/);
assert.match(ingest, /outcome\.diagnostic\?\.discoveryReason/);
assert.match(ingest, /outcome\.diagnostic\?\.sourceType/);
assert.match(ingest, /outcomeId[\s\S]*reportedVersion/);
assert.match(extension, /discoveryRoute: 'data'/);
assert.match(extension, /discoveryRoute: 'dom'/);
assert.match(extension, /discoveryRoute: 'none'/);
assert.match(extension, /diagnostic \}/);
for (const column of ['extension_version','source_type','source_id','source_vanity','discovery_route','discovery_reason','discovery_attempt']) {
 assert.match(migration, new RegExp('ADD COLUMN '+column+' '), column+' migration required');
 assert.ok(ingest.includes(column), column+' persisted');
}
const data = {
 generatedAt:'2026-10-28T06:00:00Z',
 today:{confirmed:1,failed:1,skipped:0,already_reposted:0,total:2},
 yesterday:{confirmed:0,failed:0},
 week:{confirmed:1}, activeUsers:1, activeTeams:1,
 installs:{connected:1,connectedToday:0}, users:{newToday:0,total:1},
 sources:{companies:1,people:0}, lifetimeConfirmed:1, userReportsSentToday:0,
 delivery:{pendingRetries:0,byStatus:[]}, silentInstalls:[],
 failureReasons:[{reason:'linkedin_layout_unrecognized',count:1}],
 topSources:[], teams:[],
 recent:[{company_name:'Enzymicals AG',status:'failed',extension_version:'1.2.29',discovery_route:'none',discovery_reason:'linkedin_layout_unrecognized',source_type:'company'}]
};
const email=buildAdminReportEmail(data);
assert.match(email.html,/Failed repost diagnostics/);
assert.match(email.html,/1\.2\.29/);
assert.match(email.html,/Enzymicals AG/);
assert.match(email.html,/linkedin_layout_unrecognized/);
console.log('repost diagnostic regression checks passed');
