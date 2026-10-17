/**
 * Fail-closed copy for adoption export GET JSON errorCodes.
 * Prefer body.error when present (comparison product prefix / dynamic detail).
 * Keep static strings in sync with benefitExport / comparisonExport / runCsvExport.
 */

export type ExportGetErrorBody = {
  error?: string;
  errorCode?: string;
};

/** Run CSV / Benefit 404 when result.json is missing. */
export const EXPORT_RESULT_NOT_READY = "result not ready";
export const EXPORT_RESULT_NOT_FOUND = "result not found";

/** Comparison CSV / archive 404 when meta or comparison.json missing. */
export const EXPORT_COMPARISON_NOT_READY = "comparison not ready";
export const EXPORT_EVALUATION_META_MISSING =
  "evaluation.json missing — paired meta required";

const EXPORT_FAIL_CLOSED: Record<string, string> = {
  export_result_not_ready: EXPORT_RESULT_NOT_READY,
  export_result_not_found: EXPORT_RESULT_NOT_FOUND,
  export_comparison_not_ready: EXPORT_COMPARISON_NOT_READY,
  export_evaluation_meta_missing: EXPORT_EVALUATION_META_MISSING,

  benefit_export_smoke_forbidden:
    "benefit export rejects evaluation.smoke=true (fixture plant)",
  benefit_export_fake_produce_forbidden:
    "benefit export rejects FAKE_PRODUCE tip legs (not live evidence)",
  benefit_export_official_required:
    "benefit export requires mode=official (dry-run is not adoption evidence)",
  benefit_export_not_decisive:
    "benefit export requires use or do_not_use recommendation (not inconclusive)",
  benefit_export_not_tip_candidate:
    "benefit export requires this runId to be the Comparison candidateRunId (tip leg)",
  benefit_export_comparison_pass_required:
    "benefit export USE requires official Comparison PASS",
  benefit_export_comparison_fail_required:
    "benefit export DO NOT USE requires official Comparison FAIL",
  benefit_export_not_attested:
    "benefit export requires produceAttested=true on both tip legs",

  // Default product wording = comparison CSV; archive/POST may send body.error.
  comparison_export_not_official:
    "comparison CSV export requires mode=official (dry-run is not adoption evidence)",
  comparison_export_inconclusive:
    "comparison CSV export requires PASS or FAIL verdict (not INCONCLUSIVE)",
  comparison_export_smoke_forbidden:
    "comparison CSV export rejects evaluation.smoke=true (fixture plant)",
  comparison_export_fake_produce_forbidden:
    "comparison CSV export rejects FAKE_PRODUCE tip legs (not live evidence)",
  comparison_export_not_attested:
    "comparison CSV export requires produceAttested=true on both tip legs",

  run_csv_eval_smoke_forbidden:
    "run CSV export rejects evaluation.smoke=true (fixture plant)",
  run_csv_smoke_forbidden:
    "run CSV export blocked while FAKE_PRODUCE smoke harness was used",
  run_csv_official_required:
    "run CSV export requires mode=official (dry-run is not adoption evidence)",
  run_csv_pair_required:
    "run CSV export requires paired evaluationId (baseline↔candidate)",
  run_csv_comparison_not_official:
    "run CSV export requires official Comparison mode",
  run_csv_comparison_not_decisive:
    "run CSV export requires Comparison PASS or FAIL (not INCONCLUSIVE / not ready)",
  run_csv_not_meta_leg:
    "run CSV export requires this runId to be a current Comparison meta leg",
  run_csv_not_attested:
    "run CSV export requires produceAttested=true on this run and both tip legs",
};

/**
 * Map export GET JSON errorCodes to shared copy (fail-closed when error
 * field is missing). Used by downloadExport.
 */
export function resolveExportGetError(
  body: ExportGetErrorBody,
  statusFallback: string,
): string {
  const fromBody = body.error?.trim();
  if (body.errorCode && EXPORT_FAIL_CLOSED[body.errorCode]) {
    return fromBody || EXPORT_FAIL_CLOSED[body.errorCode]!;
  }
  return fromBody || statusFallback;
}

/** Known adoption export errorCodes (for tests / source locks). */
export function exportFailClosedErrorCodes(): string[] {
  return Object.keys(EXPORT_FAIL_CLOSED).sort();
}
