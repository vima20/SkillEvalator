/**
 * Fail-closed copy for GET /api/runs/[runId] poll / Refresh.
 * Prefer body.error when present.
 */

export type RunDetailGetErrorCode =
  | "run_detail_not_found"
  | "run_detail_invalid_request"
  | "run_detail_failed";

export type RunDetailGetErrorBody = {
  error?: string;
  errorCode?: string;
};

export const RUN_DETAIL_NOT_FOUND_ERROR = "Run not found.";
export const RUN_DETAIL_NOT_FOUND_API_ERROR = "not found";
export const RUN_DETAIL_INVALID_REQUEST_ERROR = "invalid request";
export const RUN_DETAIL_FAILED_ERROR =
  "Network error while refreshing run status.";
export const RUN_DETAIL_HTTP_FAILED_FALLBACK =
  "Could not refresh run status.";

const FAIL_CLOSED: Record<RunDetailGetErrorCode, string> = {
  run_detail_not_found: RUN_DETAIL_NOT_FOUND_ERROR,
  run_detail_invalid_request: RUN_DETAIL_INVALID_REQUEST_ERROR,
  run_detail_failed: RUN_DETAIL_FAILED_ERROR,
};

/**
 * Map GET /api/runs/[runId] JSON errorCodes to poll/Refresh copy.
 * Prefer body.error except short API "not found" → unlock-friendly sentence.
 */
export function resolveRunDetailGetError(
  body: RunDetailGetErrorBody,
  statusFallback?: string,
): string {
  const fromBody = body.error?.trim();
  if (
    body.errorCode === "run_detail_not_found" ||
    fromBody === RUN_DETAIL_NOT_FOUND_API_ERROR
  ) {
    if (fromBody && fromBody !== RUN_DETAIL_NOT_FOUND_API_ERROR) {
      return fromBody;
    }
    return RUN_DETAIL_NOT_FOUND_ERROR;
  }
  const code = body.errorCode as RunDetailGetErrorCode | undefined;
  if (code && FAIL_CLOSED[code]) {
    return fromBody || FAIL_CLOSED[code];
  }
  return (
    fromBody ||
    statusFallback ||
    RUN_DETAIL_HTTP_FAILED_FALLBACK
  );
}

/** HTTP status line when JSON body has no usable error/errorCode. */
export function resolveRunDetailHttpError(status: number): string {
  return `Could not refresh run status (HTTP ${status}).`;
}

export function knownRunDetailGetErrorCodes(): RunDetailGetErrorCode[] {
  return Object.keys(FAIL_CLOSED) as RunDetailGetErrorCode[];
}
