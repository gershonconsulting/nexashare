// Commercial restrictions remain disabled throughout proof-of-concept testing.
// Paid enrollment is optional and does not change application access.
export const ACCESS_MODE = 'proof_of_concept';
export const SUCCESS_TARGET_PERCENT = 75;

export function proofOfConceptProgress(confirmed = 0, failed = 0) {
  confirmed = Number(confirmed || 0);
  failed = Number(failed || 0);
  const attempts = confirmed + failed;
  const exactRate = attempts ? confirmed / attempts * 100 : null;
  return {
    target_percent: SUCCESS_TARGET_PERCENT,
    attempts,
    success_rate: exactRate === null ? null : Math.round(exactRate * 10) / 10,
    target_met: attempts ? confirmed * 100 >= attempts * SUCCESS_TARGET_PERCENT : false,
    percentage_points_remaining: exactRate === null ? null : Math.ceil(Math.max(0, SUCCESS_TARGET_PERCENT - exactRate) * 10) / 10,
    status: !attempts ? 'no_attempts' : confirmed * 100 >= attempts * SUCCESS_TARGET_PERCENT ? 'target_met' : 'below_target'
  };
}
