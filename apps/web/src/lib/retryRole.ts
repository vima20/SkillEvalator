/**
 * Resolve Unikie retry role without trusting JobManifestSchema's default
 * "candidate" when the on-disk job file omitted role.
 */

export type EvalRole = "baseline" | "candidate";

/** Only when the raw job JSON explicitly recorded a role. */
export function roleFromJobRaw(raw: unknown): EvalRole | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const role = (raw as { role?: unknown }).role;
  if (role === "baseline" || role === "candidate") return role;
  return undefined;
}

/**
 * Prefer status.json (written at enqueue), then result.json, then an
 * explicit job-file role — never a schema-injected default.
 */
export function resolveRetryRole(opts: {
  statusRole?: EvalRole | null;
  resultRole?: EvalRole | null;
  jobRoleExplicit?: EvalRole | null;
}): EvalRole {
  return (
    opts.statusRole ?? opts.resultRole ?? opts.jobRoleExplicit ?? "candidate"
  );
}

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
