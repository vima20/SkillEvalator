/** Same New run copy — shown when Retry is disabled for COST_CAP. */
export function formatRetryCostBlockedReason(costCapUsd: number): string {
  return `Per-leg estimate exceeds the $${costCapUsd} USD hard-stop — lower repeats/tasks or raise COST_CAP_USD (worker may budget_stop).`;
}
