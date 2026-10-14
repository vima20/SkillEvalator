/**
 * Benefit CTA on run detail — tip only for adoption; superseded/smoke demoted.
 */
export function benefitCtaHint(opts: {
  runId: string;
  role?: string;
  evaluationId?: string;
  fakeProduce?: boolean;
  tipCandidateRunId?: string | null;
}):
  | { kind: "baseline"; comparisonHref?: string }
  | { kind: "missing_role" }
  | { kind: "smoke" }
  | { kind: "superseded"; tipRunId: string }
  | { kind: "tip" }
  | { kind: "unpaired" } {
  if (opts.role === "baseline") {
    return {
      kind: "baseline",
      ...(opts.evaluationId
        ? { comparisonHref: `/comparison/${opts.evaluationId}` }
        : {}),
    };
  }
  if (opts.role !== "candidate") return { kind: "missing_role" };
  if (opts.fakeProduce === true) return { kind: "smoke" };
  if (!opts.evaluationId) return { kind: "unpaired" };
  if (opts.tipCandidateRunId && opts.tipCandidateRunId !== opts.runId) {
    return { kind: "superseded", tipRunId: opts.tipCandidateRunId };
  }
  return { kind: "tip" };
}
