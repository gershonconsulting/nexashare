import assert from 'node:assert/strict';
import entry from '../src/entry.js';
import { CURRENT_EXTENSION_VERSION, dailyReportJobs } from '../src/worker.js';

let completeUserSend;
const userSend = new Promise(resolve => { completeUserSend = resolve; });
let storedUserReports = 0;
let adminObserved = null;
const jobs = dailyReportJobs({}, async () => {
  await userSend;
  storedUserReports = 2;
  return { sent: 2 };
}, async () => { adminObserved = storedUserReports; return { sent: 1 }; });
await Promise.resolve();
assert.equal(adminObserved, null, 'admin must wait while user email/audit writes are pending');
completeUserSend();
assert.deepEqual(await Promise.all(jobs), [{ sent: 2 }, { sent: 1 }]);
assert.equal(adminObserved, 2);
let failureAdminCalled = false;
const failureJobs = dailyReportJobs({}, async () => { throw new Error('D1 unavailable'); }, async () => {
  failureAdminCalled = true;
  return { sent: 1 };
});
const failed = await Promise.all(failureJobs);
assert.equal(failed[0].error, 'user_report_batch_failed');
assert.equal(failureAdminCalled, true, 'user batch failure must not silence the administrator report');

for (const method of ['GET', 'HEAD']) {
  for (const path of ['/nexashare-extension.zip', `/nexashare-extension-${CURRENT_EXTENSION_VERSION}.zip`]) {
    const response = await entry.fetch(new Request('https://nexashare.com' + path, { method }), {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `https://github.com/gershonconsulting/nexashare/releases/download/extension-v${CURRENT_EXTENSION_VERSION}/nexashare-extension-${CURRENT_EXTENSION_VERSION}.zip`);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
}
console.log('Daily report ordering and extension download routing checks passed.');
