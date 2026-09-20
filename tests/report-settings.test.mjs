import assert from 'node:assert/strict';
import {
  DEFAULT_REPORT_RECIPIENT,
  isValidReportRecipient,
  normalizeReportRecipient,
  readReportRecipient,
  saveReportRecipient
} from '../src/report-settings.js';

assert.equal(normalizeReportRecipient('  Reports@Example.COM '), 'reports@example.com');
assert.equal(isValidReportRecipient('reports@example.com'), true);
for (const invalid of ['', 'missing-at.example.com', 'a@localhost', 'a@example.com,b@example.com', 'a @example.com']) {
  assert.equal(isValidReportRecipient(invalid), false, `${invalid || '(empty)'} must be rejected`);
}

let savedValues;
const saveDb = {
  prepare(sql) {
    assert.match(sql, /INSERT INTO report_settings/);
    return {
      bind(...values) {
        savedValues = values;
        return { run: async () => ({ meta: { changes: 1 } }) };
      }
    };
  }
};
assert.deepEqual(await saveReportRecipient({ DB: saveDb }, ' Reports@Example.COM ', 42), { email: 'reports@example.com' });
assert.deepEqual(savedValues, ['reports@example.com', 42]);
await assert.rejects(() => saveReportRecipient({ DB: saveDb }, 'not-an-email', 42), /Enter one valid email address/);

const stored = await readReportRecipient({
  DB: { prepare: () => ({ first: async () => ({ recipient_email: 'owner@example.com', updated_at: '2026-09-20 12:00:00' }) }) }
});
assert.deepEqual(stored, { email: 'owner@example.com', source: 'database', updatedAt: '2026-09-20 12:00:00', error: null });

const invalidStored = await readReportRecipient({
  DB: { prepare: () => ({ first: async () => ({ recipient_email: 'broken' }) }) }
});
assert.equal(invalidStored.email, null);
assert.equal(invalidStored.error, 'stored_recipient_invalid');

const defaulted = await readReportRecipient({
  DB: { prepare: () => ({ first: async () => null }) }
});
assert.equal(defaulted.email, DEFAULT_REPORT_RECIPIENT);
assert.equal(defaulted.source, 'migration_default');

const badLegacy = await readReportRecipient({
  ADMIN_REPORT_TO: 'bad,address@example.com',
  DB: { prepare: () => ({ first: async () => null }) }
});
assert.equal(badLegacy.email, null);
assert.equal(badLegacy.error, 'legacy_recipient_invalid');

console.log('Report settings tests passed');
