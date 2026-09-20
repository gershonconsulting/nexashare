export const DEFAULT_REPORT_RECIPIENT = 'report@gershonconsulting.com';

// The settings screen intentionally accepts one mailbox. This avoids partial
// delivery and ambiguous ownership when one address in a comma-separated list
// is malformed.
export function normalizeReportRecipient(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidReportRecipient(value) {
  const email = normalizeReportRecipient(value);
  if (!email || email.length > 254 || /[\s,;]/.test(email)) return false;
  return /^[^@]+@[^@.]+(?:\.[^@.]+)+$/.test(email);
}

export async function readReportRecipient(env) {
  try {
    const row = await env.DB.prepare(
      'SELECT recipient_email, updated_at FROM report_settings WHERE id = 1'
    ).first();
    if (row) {
      const email = normalizeReportRecipient(row.recipient_email);
      return {
        email: isValidReportRecipient(email) ? email : null,
        source: 'database',
        updatedAt: row.updated_at || null,
        error: isValidReportRecipient(email) ? null : 'stored_recipient_invalid'
      };
    }
  } catch (error) {
    // During a rolling deploy the Worker can briefly precede its migration.
    console.error('Report recipient lookup failed', { message: error?.message });
  }

  if (env.ADMIN_REPORT_TO !== undefined) {
    const legacy = normalizeReportRecipient(env.ADMIN_REPORT_TO);
    return {
      email: isValidReportRecipient(legacy) ? legacy : null,
      source: 'legacy_environment',
      updatedAt: null,
      error: isValidReportRecipient(legacy) ? null : 'legacy_recipient_invalid'
    };
  }

  return { email: DEFAULT_REPORT_RECIPIENT, source: 'migration_default', updatedAt: null, error: null };
}

export async function saveReportRecipient(env, value, updatedBy) {
  const email = normalizeReportRecipient(value);
  if (!isValidReportRecipient(email)) {
    const error = new Error('Enter one valid email address.');
    error.code = 'invalid_report_recipient';
    throw error;
  }
  await env.DB.prepare(
    `INSERT INTO report_settings (id, recipient_email, updated_by, updated_at)
     VALUES (1, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET recipient_email = excluded.recipient_email,
       updated_by = excluded.updated_by, updated_at = datetime('now')`
  ).bind(email, updatedBy || null).run();
  return { email };
}
