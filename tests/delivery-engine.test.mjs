import assert from 'node:assert/strict';
import { classifyFailure, deliveryStatusFromOutcome, retryDelayMinutes } from '../src/delivery-engine.js';

assert.deepEqual(deliveryStatusFromOutcome({ status: 'confirmed' }), 'published');
assert.deepEqual(deliveryStatusFromOutcome({ status: 'already_reposted' }), 'already_reposted');
assert.deepEqual(deliveryStatusFromOutcome({ status: 'skipped' }), 'skipped');
assert.deepEqual(deliveryStatusFromOutcome({ status: 'failed' }), 'failed');

assert.deepEqual(classifyFailure('LinkedIn did not finish loading the posts in time.'), {
  code: 'post_discovery_failed', retryable: true
});
assert.deepEqual(classifyFailure('LinkedIn sign-in is required.'), {
  code: 'linkedin_session_required', retryable: false
});
assert.deepEqual(classifyFailure('No new eligible posts were found.'), {
  code: 'no_eligible_post', retryable: false
});
assert.equal(retryDelayMinutes(1), 15);
assert.equal(retryDelayMinutes(2), 30);
assert.equal(retryDelayMinutes(3), 60);

console.log('Delivery engine checks passed.');
