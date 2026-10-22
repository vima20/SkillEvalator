/**
 * Fail-closed copy for adoption export GET JSON errorCodes.
 * Prefer body.error when present (comparison product prefix / dynamic detail).
 * Keep static strings in sync with benefitExport / comparisonExport / runCsvExport.
 */

export type ExportGetErrorBody = {
  error?: string;
  errorCode?: string;
};

/** Same product labels as officialComparisonExportGate. */
export type ComparisonExportProduct =
  | "comparison CSV export"
  | "pilot archive download";

/** Run CSV / Benefit 404 when result.json is missing. */
export const EXPORT_RESULT_NOT_READY = "result not ready";
export const EXPORT_RESULT_NOT_FOUND = "result not found";

/** Comparison CSV / archive 404 when meta or comparison.json missing. */
export const EXPORT_COMPARISON_NOT_READY = "comparison not ready";
export const EXPORT_EVALUATION_META_MISSING =
  "evaluation.json missing — paired meta required";

/** Export GET catch — same pattern as run_detail_* / enqueue_*. */
export const EXPORT_INVALID_REQUEST_ERROR = "invalid request";
export const EXPORT_FAILED_ERROR = "Export download failed";

/** Suffix after product prefix — mirrors officialComparisonExportGate. */
const COMPARISON_EXPORT_SUFFIX: Record<string, string> = {
  comparison_export_not_official:
    "requires mode=official (dry-run is not adoption evidence)",
  comparison_export_inconclusive:
    "requires PASS or FAIL verdict (not INCONCLUSIVE)",
  comparison_export_provisional_pass:
    "locked — provisional official PASS (confirm with a second official pair before export)",
  comparison_export_smoke_forbidden:
    "rejects evaluation.smoke=true (fixture plant)",
  comparison_export_fake_produce_forbidden:
    "rejects FAKE_PRODUCE tip legs (not live evidence)",
  comparison_export_not_attested:
    "requires produceAttested=true on both tip legs",
};

const EXPORT_FAIL_CLOSED: Record<string, string> = {
  export_result_not_ready: EXPORT_RESULT_NOT_READY,
  export_result_not_found: EXPORT_RESULT_NOT_FOUND,
  export_comparison_not_ready: EXPORT_COMPARISON_NOT_READY,
  export_evaluation_meta_missing: EXPORT_EVALUATION_META_MISSING,
  export_invalid_request: EXPORT_INVALID_REQUEST_ERROR,
  export_failed: EXPORT_FAILED_ERROR,

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
  benefit_export_provisional_pass:
    "benefit export USE locked — provisional official PASS (confirm with a second official pair)",
  benefit_export_comparison_fail_required:
    "benefit export DO NOT USE requires official Comparison FAIL",
  benefit_export_not_attested:
    "benefit export requires produceAttested=true on both tip legs",

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
  run_csv_provisional_pass:
    "run CSV export locked — provisional official PASS (confirm with a second official pair)",
  run_csv_not_meta_leg:
    "run CSV export requires this runId to be a current Comparison meta leg",
  run_csv_not_attested:
    "run CSV export requires produceAttested=true on this run and both tip legs",
};

export type ResolveExportGetErrorOpts = {
  /** CSV vs pilot archive — only affects comparison_export_* fail-closed. */
  comparisonProduct?: ComparisonExportProduct;
};

/** Infer product from export GET href (/archive vs /csv). */
export function comparisonExportProductFromHref(
  href: string,
): ComparisonExportProduct {
  const path = (href.split("?")[0] ?? href).replace(/\/+$/, "");
  if (path.endsWith("/archive")) return "pilot archive download";
  return "comparison CSV export";
}

function comparisonExportFailClosed(
  errorCode: string,
  product: ComparisonExportProduct,
): string | undefined {
  const suffix = COMPARISON_EXPORT_SUFFIX[errorCode];
  return suffix ? `${product} ${suffix}` : undefined;
}

/**
 * Map export GET JSON errorCodes to shared copy (fail-closed when error
 * field is missing). Used by downloadExport.
 */
export function resolveExportGetError(
  body: ExportGetErrorBody,
  statusFallback: string,
  opts?: ResolveExportGetErrorOpts,
): string {
  const fromBody = body.error?.trim();
  const code = body.errorCode;
  if (code) {
    const comparison = comparisonExportFailClosed(
      code,
      opts?.comparisonProduct ?? "comparison CSV export",
    );
    if (comparison) return fromBody || comparison;
    if (EXPORT_FAIL_CLOSED[code]) {
      return fromBody || EXPORT_FAIL_CLOSED[code]!;
    }
  }
  return fromBody || statusFallback;
}

/**
 * SSR / UI lock hint from a denied export gate — same map as downloadExport
 * (prefer gate.error, fail-closed on errorCode alone).
 */
export function exportGateBlockMessage(
  gate: {
    error?: string;
    errorCode?: string;
  },
  opts?: ResolveExportGetErrorOpts,
): string {
  return resolveExportGetError(
    { error: gate.error, errorCode: gate.errorCode },
    "Adoption export locked",
    opts,
  );
}

/** Run-detail CSV span when block reason is missing (should be rare). */
export const EXPORT_RUN_CSV_LOCKED_FALLBACK =
  "CSV export locked (official + Comparison PASS/FAIL)";

/** BenefitActions when exportBlockReason is empty. */
export const EXPORT_BENEFIT_LOCKED_FALLBACK =
  "Adoption export locked until official Comparison is decisive (USE needs PASS; DO NOT USE needs FAIL). API returns 409 otherwise.";

/** Client-only downloadExport fetch failures (no JSON errorCode). */
export type ExportDownloadFetchFailKind =
  | "http"
  | "network"
  | "unexpected_json"
  | "failed";

export const EXPORT_DOWNLOAD_NETWORK_ERROR =
  "Download failed — network error";
export const EXPORT_DOWNLOAD_UNEXPECTED_JSON =
  "Unexpected JSON response (export locked or unauthorized)";
export const EXPORT_DOWNLOAD_FAILED_FALLBACK = "Download failed";

/** HTTP / network / unexpected JSON → downloadExport alert copy. */
export function resolveExportDownloadFetchError(
  kind: ExportDownloadFetchFailKind,
  status?: number,
): string {
  if (kind === "network") return EXPORT_DOWNLOAD_NETWORK_ERROR;
  if (kind === "unexpected_json") return EXPORT_DOWNLOAD_UNEXPECTED_JSON;
  if (kind === "http" && typeof status === "number") {
    return `Download failed (${status})`;
  }
  return EXPORT_DOWNLOAD_FAILED_FALLBACK;
}

/** Known adoption export errorCodes (for tests / source locks). */
export function exportFailClosedErrorCodes(): string[] {
  return [
    ...Object.keys(EXPORT_FAIL_CLOSED),
    ...Object.keys(COMPARISON_EXPORT_SUFFIX),
  ].sort();
}
