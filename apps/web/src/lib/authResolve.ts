/**
 * Fail-closed copy for Unikie unlock / POST /api/auth.
 * Prefer body.error when present; keep strings in sync with the auth route.
 */

export type AuthPostErrorCode =
  | "auth_misconfigured"
  | "auth_invalid_token"
  | "auth_invalid_request"
  | "auth_unauthorized"
  | "auth_probe_failed"
  | "auth_unreachable";

export type AuthPostErrorBody = {
  error?: string;
  errorCode?: string;
  misconfigured?: boolean;
};

/** Same detail as API 503 + AuthGate misconfigured banner. */
export const AUTH_MISCONFIGURED_ERROR =
  "WEB_AUTH_TOKEN is misconfigured (empty or whitespace only). Set a real token in .env and restart web + worker.";

/** Shorter API 503 error field (legacy); resolver prefers AUTH_MISCONFIGURED_ERROR. */
export const AUTH_MISCONFIGURED_API_ERROR =
  "WEB_AUTH_TOKEN misconfigured (empty or whitespace only)";

export const AUTH_INVALID_TOKEN_ERROR = "invalid token";
export const AUTH_INVALID_REQUEST_ERROR = "invalid request";
/** Middleware 401 for protected /api/* when cookie/token missing. */
export const AUTH_UNAUTHORIZED_ERROR = "unauthorized";
export const AUTH_PROBE_FAILED_ERROR = "Auth check failed — unlock or retry.";
export const AUTH_UNREACHABLE_ERROR =
  "Could not reach auth API — check that the web server is running.";
export const AUTH_UNLOCK_FAILED = "Unlock failed";

const FAIL_CLOSED: Record<AuthPostErrorCode, string> = {
  auth_misconfigured: AUTH_MISCONFIGURED_ERROR,
  auth_invalid_token: AUTH_INVALID_TOKEN_ERROR,
  auth_invalid_request: AUTH_INVALID_REQUEST_ERROR,
  auth_unauthorized: AUTH_UNAUTHORIZED_ERROR,
  auth_probe_failed: AUTH_PROBE_FAILED_ERROR,
  auth_unreachable: AUTH_UNREACHABLE_ERROR,
};

/**
 * Map POST /api/auth + middleware /api/* JSON errorCodes to unlock copy
 * (fail-closed when error is missing). Also treats misconfigured:true
 * without a code.
 */
export function resolveAuthPostError(body: AuthPostErrorBody): string {
  if (body.misconfigured || body.errorCode === "auth_misconfigured") {
    const fromBody = body.error?.trim();
    // Prefer unlock guidance over the short API literal.
    if (fromBody && fromBody !== AUTH_MISCONFIGURED_API_ERROR) {
      return fromBody;
    }
    return AUTH_MISCONFIGURED_ERROR;
  }
  const fromBody = body.error?.trim();
  const code = body.errorCode as AuthPostErrorCode | undefined;
  if (code && FAIL_CLOSED[code]) {
    return fromBody || FAIL_CLOSED[code];
  }
  return fromBody || AUTH_UNLOCK_FAILED;
}

/** Client-only probe failures (GET /api/auth network / non-OK). */
export function resolveAuthClientError(
  kind: "probe_failed" | "unreachable",
): string {
  return kind === "unreachable"
    ? AUTH_UNREACHABLE_ERROR
    : AUTH_PROBE_FAILED_ERROR;
}

export function knownAuthPostErrorCodes(): AuthPostErrorCode[] {
  return Object.keys(FAIL_CLOSED) as AuthPostErrorCode[];
}
