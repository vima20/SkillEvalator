import type { ComparisonVerdict, RunComparison } from "@skillevalator/core";

/**
 * Adoption CSV must not look like an official export when Comparison is
 * INCONCLUSIVE, or when the pair is only dry-run.
 */
export function comparisonCsvGate(
  comparison: Pick<RunComparison, "verdict" | "mode"> | ComparisonVerdict,
):
  | { ok: true }
  | {
      ok: false;
      status: 409;
      error: string;
      verdict: ComparisonVerdict;
      mode?: RunComparison["mode"];
    } {
  const verdict =
    typeof comparison === "string" ? comparison : comparison.verdict;
  const mode = typeof comparison === "string" ? undefined : comparison.mode;

  if (mode !== undefined && mode !== "official") {
    return {
      ok: false,
      status: 409,
      verdict,
      mode,
      error:
        "comparison CSV export requires mode=official (dry-run is not adoption evidence)",
    };
  }
  if (verdict === "PASS" || verdict === "FAIL") {
    return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    verdict,
    ...(mode ? { mode } : {}),
    error:
      "comparison CSV export requires PASS or FAIL verdict (not INCONCLUSIVE)",
  };
}
