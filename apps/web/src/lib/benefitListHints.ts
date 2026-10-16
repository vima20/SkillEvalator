import { comparisonHarnessHint } from "@/lib/comparisonDetailHints";

/** Same cell-meta labels as Comparison list (paired rows only). */
export type BenefitListPairChip = "mixed" | "smoke" | "not attested";

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
