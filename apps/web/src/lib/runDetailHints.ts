import { candidateLegKind } from "@/lib/candidateLeg";

/**
 * Benefit CTA on run detail — tip only for adoption; superseded/smoke demoted.
 * Waiting tip (paired, tip unknown) still offers Benefit as tip (same as before).
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

  const leg = candidateLegKind(opts);
  if (leg === "smoke") return { kind: "smoke" };
  if (leg === "single") return { kind: "unpaired" };
  if (leg === "superseded") {
    return {
      kind: "superseded",
      tipRunId: opts.tipCandidateRunId as string,
    };
  }
  // tip | waiting → offer Benefit on this candidate
  return { kind: "tip" };
}
