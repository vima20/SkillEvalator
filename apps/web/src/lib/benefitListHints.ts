import { comparisonHarnessHint } from "@/lib/comparisonDetailHints";

/** Same cell-meta labels as Comparison list (paired rows only). */
export type BenefitListPairChip = "mixed" | "smoke" | "not attested";

type TipCapture = {
  capture?: { env?: { fakeProduce?: boolean; produceAttested?: boolean } };
} | null;

/**
 * Pair evidence from a packed evaluation — shared by Benefit / Runs / Dashboard.
 */
export function benefitPairEvidenceFromPacked(opts: {
  tipBaselineRunId?: string | null;
  tipCandidateRunId?: string | null;
  metaSmoke?: boolean;
  baseline?: TipCapture;
  candidate?: TipCapture;
}): {
  paired: boolean;
  pairEvidence: {
    metaSmoke: boolean;
    baselineFakeProduce: boolean;
    candidateFakeProduce: boolean;
    baselineProduceAttested: boolean;
    candidateProduceAttested: boolean;
  };
  pairChip: BenefitListPairChip | null;
  pairBlocked: boolean;
} {
  const paired = Boolean(opts.tipBaselineRunId && opts.tipCandidateRunId);
  const pairEvidence = {
    metaSmoke: opts.metaSmoke === true,
    baselineFakeProduce: opts.baseline?.capture?.env?.fakeProduce === true,
    candidateFakeProduce: opts.candidate?.capture?.env?.fakeProduce === true,
    baselineProduceAttested:
      opts.baseline?.capture?.env?.produceAttested === true,
    candidateProduceAttested:
      opts.candidate?.capture?.env?.produceAttested === true,
  };
  const pairChip = benefitListPairChip({
    paired,
    ...pairEvidence,
    baselineHasResult: Boolean(opts.baseline),
    candidateHasResult: Boolean(opts.candidate),
  });
  const pairBlocked =
    paired && benefitListPairBlocksAdoption(pairEvidence);
  return { paired, pairEvidence, pairChip, pairBlocked };
}

/**
 * Pair-level evidence chip for Benefit index — mirrors Comparison list
 * mixed / smoke / not attested (not candidate-leg-only).
 */
export function benefitListPairChip(opts: {
  paired: boolean;
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  /** Tip baseline result.json present */
  baselineHasResult?: boolean;
  /** Tip candidate result.json present */
  candidateHasResult?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
}): BenefitListPairChip | null {
  if (!opts.paired) return null;
  const baseFake = opts.baselineFakeProduce === true;
  const candFake = opts.candidateFakeProduce === true;
  if (baseFake !== candFake) return "mixed";
  if (opts.metaSmoke === true || baseFake || candFake) return "smoke";
  if (
    (opts.baselineHasResult === true &&
      opts.baselineProduceAttested !== true) ||
    (opts.candidateHasResult === true &&
      opts.candidateProduceAttested !== true)
  ) {
    return "not attested";
  }
  return null;
}

/** Same bar as run-detail Benefit CTA / export sibling gates. */
export function benefitListPairBlocksAdoption(opts: {
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
}): boolean {
  return comparisonHarnessHint(opts).kind !== "none";
}

export function benefitListPairLockedLabel(
  chip: BenefitListPairChip | null,
): string {
  if (chip === "mixed") return "locked · mixed";
  if (chip === "smoke") return "locked · smoke";
  if (chip === "not attested") return "locked · not attested";
  return "locked · pair evidence";
}

/** Same waiting/unavailable labels as Comparison list Benefit column. */
export function benefitPairCtaLabel(
  pairPending?: "waiting" | "unavailable" | null,
  opts?: { readyLabel?: string; detailArrow?: boolean },
): { label: string; title?: string } {
  if (pairPending === "waiting") {
    return {
      label: opts?.detailArrow
        ? "Open Benefit · waiting →"
        : "Benefit · waiting",
      title:
        "Candidate result ready — Benefit waiting for paired Comparison",
    };
  }
  if (pairPending === "unavailable") {
    return {
      label: opts?.detailArrow
        ? "Open Benefit · unavailable →"
        : "Benefit · unavailable",
      title:
        "No paired scorecard — open Benefit for Comparison unavailable detail",
    };
  }
  return {
    label: opts?.detailArrow
      ? "Open Benefit Report →"
      : (opts?.readyLabel ?? "Benefit"),
  };
}
