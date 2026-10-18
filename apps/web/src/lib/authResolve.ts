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

/**
 * Fail-closed unlock guidance for auth_misconfigured (API/client resolvers).
 * AuthGate card body aliases this — do not show both as alert + body.
 */
export const AUTH_MISCONFIGURED_ERROR =
  "WEB_AUTH_TOKEN is misconfigured (empty or whitespace only). Set a real token in .env and restart web + worker.";

/** Shorter API/middleware 503 error field; resolver prefers AUTH_MISCONFIGURED_ERROR. */
export const AUTH_MISCONFIGURED_API_ERROR =
  "WEB_AUTH_TOKEN misconfigured (empty or whitespace only)";

export const AUTH_INVALID_TOKEN_ERROR = "invalid token";
export const AUTH_INVALID_REQUEST_ERROR = "invalid request";
/** Short middleware 401 error field; resolver prefers AUTH_UNAUTHORIZED_ERROR. */
export const AUTH_UNAUTHORIZED_API_ERROR = "unauthorized";
/** Middleware 401 for protected /api/* when cookie/token missing. */
export const AUTH_UNAUTHORIZED_ERROR =
  "Session expired — redirecting to unlock";
export const AUTH_PROBE_FAILED_ERROR = "Auth check failed — unlock or retry.";
export const AUTH_UNREACHABLE_ERROR =
  "Could not reach auth API — check that the web server is running.";
export const AUTH_UNLOCK_FAILED = "Unlock failed";

/** AuthGate card titles / supporting copy. */
export const AUTH_GATE_MISCONFIGURED_TITLE = "WEB_AUTH_TOKEN misconfigured";
export const AUTH_GATE_PROBE_FAILED_TITLE = "Access check failed";
export const AUTH_GATE_UNLOCK_TITLE = "Unlock SkillEvalator";
/** Same guidance as AUTH_MISCONFIGURED_ERROR (single source). */
export const AUTH_GATE_MISCONFIGURED_BODY = AUTH_MISCONFIGURED_ERROR;
export const AUTH_GATE_PROBE_FAILED_BODY =
  "The browser could not confirm API access. Retry the check, or enter the access token from your admin.";
export const AUTH_GATE_UNLOCK_BODY =
  "Enter the access token provided by your admin to unlock this local evaluator.";

/** API / middleware codes (not client-only probe/unreachable). */
const AUTH_API_CODES = new Set<string>([
  "auth_misconfigured",
  "auth_invalid_token",
  "auth_invalid_request",
  "auth_unauthorized",
]);

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
  if (body.errorCode === "auth_unauthorized") {
    const fromBody = body.error?.trim();
    if (fromBody && fromBody !== AUTH_UNAUTHORIZED_API_ERROR) {
      return fromBody;
    }
    return AUTH_UNAUTHORIZED_ERROR;
  }
  const fromBody = body.error?.trim();
  const code = body.errorCode as AuthPostErrorCode | undefined;
  if (code && FAIL_CLOSED[code]) {
    return fromBody || FAIL_CLOSED[code];
  }
  return fromBody || AUTH_UNLOCK_FAILED;
}

/**
 * When a protected /api/* response is middleware auth JSON, return unlock
 * copy; otherwise null so domain resolvers stay first-class.
 */
export function tryResolveAuthApiError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as AuthPostErrorBody;
  if (rec.misconfigured === true) {
    return resolveAuthPostError(rec);
  }
  if (typeof rec.errorCode === "string" && AUTH_API_CODES.has(rec.errorCode)) {
    return resolveAuthPostError(rec);
  }
  return null;
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
