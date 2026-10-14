import type { ComparisonVerdict, RunResult } from "@skillevalator/core";

/**
 * Per-run CSV can look like pilot evidence. Require official paired Comparison
 * PASS/FAIL (same adoption bar as Comparison CSV) and refuse smoke.
 */
export function runCsvExportGate(opts: {
  result: Pick<
    RunResult,
    "mode" | "evaluationId" | "status" | "capture"
  >;
  comparisonVerdict?: ComparisonVerdict | null;
  comparisonMode?: RunResult["mode"] | null;
}):
  | { ok: true }
  | { ok: false; status: 409; error: string; errorCode: string } {
  if (opts.result.capture?.env?.fakeProduce === true) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_smoke_forbidden",
      error:
        "run CSV export blocked while FAKE_PRODUCE smoke harness was used",
    };
  }
  if (opts.result.mode !== "official") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_official_required",
      error: "run CSV export requires mode=official (dry-run is not adoption evidence)",
    };
  }
  if (!opts.result.evaluationId?.trim()) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_pair_required",
      error:
        "run CSV export requires paired evaluationId (baseline↔candidate)",
    };
  }
  if (opts.comparisonMode != null && opts.comparisonMode !== "official") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_comparison_not_official",
      error: "run CSV export requires official Comparison mode",
    };
  }
  const v = opts.comparisonVerdict;
  if (v !== "PASS" && v !== "FAIL") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_comparison_not_decisive",
      error:
        "run CSV export requires Comparison PASS or FAIL (not INCONCLUSIVE / not ready)",
    };
  }
  return { ok: true };
}
