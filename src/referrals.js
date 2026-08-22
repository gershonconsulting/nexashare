export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{10,16}$/;

export function normalizeReferralCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : '';
}

export function createReferralCode(randomValue) {
  const normalized = String(randomValue || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (normalized.length < 12) throw new Error('Referral entropy is too short.');
  return normalized.slice(0, 12);
}

export function referralUrl(origin, code) {
  const valid = normalizeReferralCode(code);
  if (!valid) throw new Error('Invalid referral code.');
  return `${String(origin).replace(/\/$/, '')}/login.html?ref=${encodeURIComponent(valid)}`;
}

export function shouldQualifyReferral(outcomes) {
  return Array.isArray(outcomes) && outcomes.some(outcome => outcome?.status === 'confirmed');
}
