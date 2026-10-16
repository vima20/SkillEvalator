import { candidateLegKind } from "@/lib/candidateLeg";
import { comparisonHarnessHint } from "@/lib/comparisonDetailHints";

/**
 * Benefit CTA on run detail — tip only for adoption; superseded/smoke demoted.
 * Waiting tip (paired, tip unknown) still offers Benefit as tip (same as before).
 * When pairEvidence is set, sibling smoke / unattested blocks adoption CTA.
 */
export function benefitCtaHint(opts: {
  runId: string;
  role?: string;
  evaluationId?: string;
  fakeProduce?: boolean;
  produceAttested?: boolean;
  tipCandidateRunId?: string | null;
  /** Sibling tip legs — omit when unpaired / unknown. */
  pairEvidence?: {
    metaSmoke?: boolean;
    baselineFakeProduce?: boolean;
    candidateFakeProduce?: boolean;
    baselineProduceAttested?: boolean;
    candidateProduceAttested?: boolean;
  };
}):
  | { kind: "baseline"; comparisonHref?: string }
  | { kind: "missing_role" }
  | { kind: "smoke" }
  | { kind: "not_attested" }
  | { kind: "superseded"; tipRunId: string }
  | { kind: "pair_blocked"; comparisonHref: string }
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
  if (leg === "not_attested") return { kind: "not_attested" };
  if (leg === "single") return { kind: "unpaired" };
  if (leg === "superseded") {
    return {
      kind: "superseded",
      tipRunId: opts.tipCandidateRunId as string,
    };
  }
  // tip | waiting — demote when sibling tip fails the same evidence bar as export.
  if (opts.pairEvidence && opts.evaluationId) {
    const harness = comparisonHarnessHint(opts.pairEvidence);
    if (harness.kind !== "none") {
      return {
        kind: "pair_blocked",
        comparisonHref: `/comparison/${opts.evaluationId}`,
      };
    }
  }
  return { kind: "tip" };
}
