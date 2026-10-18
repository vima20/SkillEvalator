/**
 * Shared fail-closed copy for New run Preflight poll and Settings Refresh.
 * Client-only fetch errors (routes usually return 200 + JSON).
 */

export type PreflightFetchFailKind = "http" | "network" | "failed";

export type SettingsRefreshFailKind =
  | "http"
  | "network"
  | "unexpected_payload"
  | "failed";

export const PREFLIGHT_NETWORK_ERROR =
  "Preflight network error — is the web server up?";

export const PREFLIGHT_FAILED_FALLBACK = "Preflight failed";

export const SETTINGS_REFRESH_NETWORK_ERROR =
  "Settings refresh network error — is the web server up?";

export const SETTINGS_REFRESH_UNEXPECTED_PAYLOAD =
  "Settings refresh returned an unexpected payload";

export const SETTINGS_REFRESH_FAILED_FALLBACK = "Settings refresh failed";

/** HTTP status → Preflight error line (NewRunForm banner). */
export function resolvePreflightFetchError(
  kind: PreflightFetchFailKind,
  status?: number,
): string {
  if (kind === "network") return PREFLIGHT_NETWORK_ERROR;
  if (kind === "http" && typeof status === "number") {
    return `Preflight failed (HTTP ${status}).`;
  }
  return PREFLIGHT_FAILED_FALLBACK;
}

/** HTTP / network / payload → Settings Refresh error line. */
export function resolveSettingsRefreshError(
  kind: SettingsRefreshFailKind,
  status?: number,
): string {
  if (kind === "network") return SETTINGS_REFRESH_NETWORK_ERROR;
  if (kind === "unexpected_payload") {
    return SETTINGS_REFRESH_UNEXPECTED_PAYLOAD;
  }
  if (kind === "http" && typeof status === "number") {
    return `Settings refresh failed (${status})`;
  }
  return SETTINGS_REFRESH_FAILED_FALLBACK;
}
