/**
 * Fail-closed gate for Unikie official (paid / adoption) enqueue + worker.
 * Smoke (FAKE_PRODUCE) and missing API key remain allowed for dry-run only.
 */

import { OFFICIAL_MIN_REPEATS } from "./job.js";
import type { WebAuthConfig } from "./webAuthConfig.js";

export type OfficialAdmissionOk = { ok: true };

export type OfficialAdmissionDenied = {
  ok: false;
  status: 400 | 503;
  error: string;
  errorCode:
    | "official_smoke_forbidden"
    | "official_api_key_missing"
    | "official_web_auth_required"
    | "official_pair_required"
    | "official_repeats_too_low";
};

export type OfficialAdmissionResult =
  | OfficialAdmissionOk
  | OfficialAdmissionDenied;

export function officialEnqueueAllowed(opts: {
  mode: "dry-run" | "official";
  env?: Record<string, string | undefined>;
  /**
   * When true (OFFICIAL_REQUIRES_WEB_AUTH), official requires webAuthKind
   * "required" (open and misconfigured both blocked).
   */
  requireWebAuthConfigured?: boolean;
  /** Prefer this over webAuthOpen — pass resolveWebAuthConfig(...).kind. */
  webAuthKind?: WebAuthConfig["kind"];
  /**
   * @deprecated Prefer webAuthKind. When kind omitted, true means open (deny).
   */
  webAuthOpen?: boolean;
  /**
   * Enqueue only: official must be baseline↔candidate (Benefit USE needs
   * Comparison PASS). Omit on worker fail-fast (job already queued).
   */
  withBaseline?: boolean;
  /**
   * Enqueue: reject official below OFFICIAL_MIN_REPEATS (do not silent-bump
   * at the API boundary). Omit on worker after normalizeRepeats.
   */
  repeats?: number;
}): OfficialAdmissionResult {
  if (opts.mode !== "official") return { ok: true };

  const env = opts.env ?? process.env;
  if (env.FAKE_PRODUCE === "known-good") {
    return {
      ok: false,
      status: 400,
      errorCode: "official_smoke_forbidden",
      error:
        "official mode requires live OpenAI produce — unset FAKE_PRODUCE (smoke is dry-run only)",
    };
  }
  if (!env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      status: 503,
      errorCode: "official_api_key_missing",
      error: "official mode requires OPENAI_API_KEY in .env",
    };
  }
  if (opts.requireWebAuthConfigured) {
    const kind =
      opts.webAuthKind ??
      (opts.webAuthOpen === true
        ? "open"
        : opts.webAuthOpen === false
          ? "required"
          : undefined);
    if (kind !== undefined && kind !== "required") {
      return {
        ok: false,
        status: 503,
        errorCode: "official_web_auth_required",
        error:
          kind === "misconfigured"
            ? "official mode requires a non-empty WEB_AUTH_TOKEN (whitespace-only is misconfigured; OFFICIAL_REQUIRES_WEB_AUTH is enabled)"
            : "official mode requires WEB_AUTH_TOKEN (set a non-empty token; OFFICIAL_REQUIRES_WEB_AUTH is enabled)",
      };
    }
  }
  if (opts.withBaseline === false) {
    return {
      ok: false,
      status: 400,
      errorCode: "official_pair_required",
      error:
        "official mode requires baseline↔candidate pair (withBaseline) — single-leg official cannot unlock Benefit USE",
    };
  }
  if (
    typeof opts.repeats === "number" &&
    Number.isFinite(opts.repeats) &&
    opts.repeats < OFFICIAL_MIN_REPEATS
  ) {
    return {
      ok: false,
      status: 400,
      errorCode: "official_repeats_too_low",
      error: `official mode requires at least ${OFFICIAL_MIN_REPEATS} repeats (got ${opts.repeats})`,
    };
  }
  return { ok: true };
}
