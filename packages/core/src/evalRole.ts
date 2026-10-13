/**
 * Resolve Unikie baseline/candidate role without trusting
 * JobManifestSchema's default "candidate" when the on-disk job omitted role.
 */

import type { EvalRole } from "./schema.js";

/** Only when the raw JSON explicitly recorded a role. */
export function roleFromJobRaw(raw: unknown): EvalRole | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const role = (raw as { role?: unknown }).role;
  if (role === "baseline" || role === "candidate") return role;
  return undefined;
}

/**
 * Prefer status.json (written at enqueue), then result.json, then an
 * explicit job-file role — never a schema-injected default alone.
 */
export function resolveEvalRole(opts: {
  statusRole?: EvalRole | null;
  resultRole?: EvalRole | null;
  jobRoleExplicit?: EvalRole | null;
}): EvalRole {
  return (
    opts.statusRole ?? opts.resultRole ?? opts.jobRoleExplicit ?? "candidate"
  );
}

/** @deprecated Use resolveEvalRole — same preference order. */
export const resolveRetryRole = resolveEvalRole;

export function evaluationIdFromSources(opts: {
  statusEvaluationId?: string | null;
  jobEvaluationId?: string | null;
  resultEvaluationId?: string | null;
}): string | undefined {
  const id =
    opts.statusEvaluationId?.trim() ||
    opts.jobEvaluationId?.trim() ||
    opts.resultEvaluationId?.trim() ||
    "";
  return id || undefined;
}
