import assert from 'node:assert/strict';
import { createReferralCode, normalizeReferralCode, referralUrl, shouldQualifyReferral } from '../src/referrals.js';

assert.equal(normalizeReferralCode(' abcd12345678 '), 'ABCD12345678');
assert.equal(normalizeReferralCode('too-short'), '');
assert.equal(normalizeReferralCode('bad code 1234'), '');
assert.equal(createReferralCode('abcd-1234-efgh-5678'), 'ABCD1234EFGH');
assert.equal(referralUrl('https://nexashare.com/', 'ABCD12345678'), 'https://nexashare.com/login.html?ref=ABCD12345678');
assert.equal(shouldQualifyReferral([{ status: 'failed' }, { status: 'skipped' }]), false);
assert.equal(shouldQualifyReferral([{ status: 'failed' }, { status: 'confirmed' }]), true);
assert.equal(shouldQualifyReferral(null), false);

console.log('Referral program checks passed.');
