/**
 * Web retry helpers — re-export shared Unikie role resolution from core.
 */
export {
  evaluationIdFromSources,
  resolveEvalRole as resolveRetryRole,
  roleFromJobRaw,
  type EvalRole,
} from "@skillevalator/core";
