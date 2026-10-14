/**
 * Fail-closed gate for Unikie official (paid / adoption) enqueue + worker.
 * Smoke (FAKE_PRODUCE) and missing API key remain allowed for dry-run only.
 */

export type OfficialAdmissionOk = { ok: true };

export type OfficialAdmissionDenied = {
  ok: false;
  status: 400 | 503;
  error: string;
  errorCode:
    | "official_smoke_forbidden"
    | "official_api_key_missing"
    | "official_web_auth_required";
};

export type OfficialAdmissionResult =
  | OfficialAdmissionOk
  | OfficialAdmissionDenied;

export function officialEnqueueAllowed(opts: {
  mode: "dry-run" | "official";
  env?: Record<string, string | undefined>;
  /**
   * When true (OFFICIAL_REQUIRES_WEB_AUTH), official is blocked if web auth is
   * open / unset. Pass webAuthOpen from resolveWebAuthConfig().kind === "open".
   */
  requireWebAuthConfigured?: boolean;
  webAuthOpen?: boolean;
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
  if (opts.requireWebAuthConfigured && opts.webAuthOpen) {
    return {
      ok: false,
      status: 503,
      errorCode: "official_web_auth_required",
      error:
        "official mode requires WEB_AUTH_TOKEN (set a non-empty token; OFFICIAL_REQUIRES_WEB_AUTH is enabled)",
    };
  }
  return { ok: true };
}
