/**
 * Locked Unikie model ids and cost-cap defaults (shared web + worker).
 * Env overrides (MODEL_DRY_RUN, MODEL_OFFICIAL, COST_CAP_USD) apply in worker.
 */

export const MODEL_DRY_RUN = "gpt-4o-mini";
export const MODEL_OFFICIAL = "gpt-4.1-mini";

/** Default COST_CAP_USD when env / preflight has not supplied a value. */
export const DEFAULT_COST_CAP_USD = 5;
