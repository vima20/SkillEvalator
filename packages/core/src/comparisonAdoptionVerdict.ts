/** Lightweight adoption verdict helper (safe for client/server subpath imports). */

export type ComparisonVerdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export type ComparisonAdoptionMode = "dry-run" | "official";

export type ComparisonAdoptionVerdictInput = {
  verdict: ComparisonVerdict;
  mode: ComparisonAdoptionMode;
  adoptionConfirmation?: { step: number; required: number } | null;
};

/**
 * Adoption-facing verdict for CSV / MANIFEST / export gates — aligns with UI
 * (INCONCLUSIVE · 1/2, dry-run). Never PASS/FAIL when adoption mode is not
 * official or a confirming official pair is still pending.
 */
export function comparisonAdoptionVerdict(
  comparison: ComparisonAdoptionVerdictInput,
  adoptionMode?: ComparisonAdoptionMode,
): ComparisonVerdict {
  const mode = adoptionMode ?? comparison.mode;
  if (mode !== "official") return "INCONCLUSIVE";
  const confirm = comparison.adoptionConfirmation;
  if (
    confirm !== undefined &&
    confirm !== null &&
    confirm.step < confirm.required
  ) {
    return "INCONCLUSIVE";
  }
  if (comparison.verdict !== "PASS" && comparison.verdict !== "FAIL") {
    return "INCONCLUSIVE";
  }
  return comparison.verdict;
}
