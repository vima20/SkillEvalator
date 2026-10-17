/**
 * Fail-closed copy for POST /api/runs/cleanup (Clear old runs / Clear smoke).
 * Prefer body.error when present.
 */

export type CleanupPostErrorCode =
  | "cleanup_invalid_request"
  | "cleanup_failed";

export type CleanupPostErrorBody = {
  error?: string;
  errorCode?: string;
};

export const CLEANUP_INVALID_REQUEST_ERROR = "invalid request";
export const CLEANUP_FAILED_ERROR = "Cleanup failed";

const FAIL_CLOSED: Record<CleanupPostErrorCode, string> = {
  cleanup_invalid_request: CLEANUP_INVALID_REQUEST_ERROR,
  cleanup_failed: CLEANUP_FAILED_ERROR,
};

/**
 * Map POST /api/runs/cleanup JSON errorCodes to shared copy (fail-closed when
 * error field is missing). Used by ClearOldRuns / ClearSmokeNoise.
 */
export function resolveCleanupPostError(body: CleanupPostErrorBody): string {
  const fromBody = body.error?.trim();
  const code = body.errorCode as CleanupPostErrorCode | undefined;
  if (code && FAIL_CLOSED[code]) {
    return fromBody || FAIL_CLOSED[code];
  }
  return fromBody || CLEANUP_FAILED_ERROR;
}

export function knownCleanupPostErrorCodes(): CleanupPostErrorCode[] {
  return Object.keys(FAIL_CLOSED) as CleanupPostErrorCode[];
}
