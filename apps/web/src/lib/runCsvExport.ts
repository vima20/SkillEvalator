import type { ComparisonVerdict, RunResult } from "@skillevalator/core";

/**
 * Per-run CSV can look like pilot evidence. Require official paired Comparison
 * PASS/FAIL on a current meta leg (same adoption bar as Comparison CSV) and
 * refuse smoke / superseded retries.
 */
export function runCsvExportGate(opts: {
  result: {
    runId?: string;
    mode: RunResult["mode"];
    evaluationId?: string;
    status?: RunResult["status"];
    capture?: { env?: { fakeProduce?: boolean } };
  };
  comparisonVerdict?: ComparisonVerdict | null;
  comparisonMode?: RunResult["mode"] | null;
  baselineRunId?: string | null;
  candidateRunId?: string | null;
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
  const runId = opts.result.runId?.trim();
  const legs = [opts.baselineRunId, opts.candidateRunId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (!runId || legs.length < 2 || !legs.includes(runId)) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_not_meta_leg",
      error:
        "run CSV export requires this runId to be a current Comparison meta leg",
    };
  }
  return { ok: true };
}
