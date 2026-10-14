import type { ComparisonVerdict } from "@skillevalator/core";

/**
 * Adoption CSV must not look like an official export when Comparison is
 * INCONCLUSIVE (parity / failed leg / smoke / meta pin).
 */
export function comparisonCsvGate(
  verdict: ComparisonVerdict,
): { ok: true } | { ok: false; status: 409; error: string; verdict: ComparisonVerdict } {
  if (verdict === "PASS" || verdict === "FAIL") {
    return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    verdict,
    error:
      "comparison CSV export requires PASS or FAIL verdict (not INCONCLUSIVE)",
  };
}
