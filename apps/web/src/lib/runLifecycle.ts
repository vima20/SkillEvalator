/**
 * Shared cancel / retry gate decisions for Unikie run lifecycle.
 * Kept pure so apps/web vitest can lock integrity regressions without Next.
 */

const CANCEL_TERMINAL = new Set(["ok", "failed", "cancelled"]);
const CANCEL_ACTIVE = new Set(["queued", "running", "cancel_requested"]);

export type CancelErrorCode =
  | "cancel_run_already_finished"
  | "cancel_invalid_status"
  | "cancel_not_found"
  | "cancel_invalid_request"
  | "cancel_failed";

export const CANCEL_NOT_FOUND_ERROR = "not found";

/** POST /cancel catch / network — same literal as prior client fallback. */
export const CANCEL_FAILED_ERROR = "Cancel failed";

export const CANCEL_INVALID_REQUEST_ERROR = "invalid request";

export type CancelGate =
  | { allow: true; alreadyCancelled?: boolean }
  | { allow: false; error: string; errorCode: CancelErrorCode };

/**
 * Whether Cancel API may write .cancel for this status.
 * `budget_stop` without result.json is wind-down (cancellable);
 * with result.json it is settled (409).
 */
export function cancelGate(
  status: string | undefined,
  hasResult: boolean,
): CancelGate {
  const current = status ?? "unknown";
  if (current === "cancelled") {
    return { allow: true, alreadyCancelled: true };
  }
  if (CANCEL_TERMINAL.has(current)) {
    return {
      allow: false,
      error: `run already finished (${current})`,
      errorCode: "cancel_run_already_finished",
    };
  }
  if (current === "budget_stop") {
    if (hasResult) {
      return {
        allow: false,
        error: `run already finished (${current})`,
        errorCode: "cancel_run_already_finished",
      };
    }
    return { allow: true };
  }
  if (!CANCEL_ACTIVE.has(current)) {
    return {
      allow: false,
      error: `cannot cancel status ${current}`,
      errorCode: "cancel_invalid_status",
    };
  }
  return { allow: true };
}

export type CancelPostErrorBody = {
  error?: string;
  errorCode?: string;
};

/**
 * Map POST /cancel JSON errorCodes to shared Cancel copy (fail-closed when
 * error field is missing). Used by RunDetailClient onCancel.
 */
export function resolveCancelPostError(body: CancelPostErrorBody): string {
  if (body.errorCode === "cancel_not_found") {
    return body.error ?? CANCEL_NOT_FOUND_ERROR;
  }
  if (body.errorCode === "cancel_run_already_finished") {
    return body.error ?? "run already finished";
  }
  if (body.errorCode === "cancel_invalid_status") {
    return body.error ?? "cannot cancel status";
  }
  if (body.errorCode === "cancel_invalid_request") {
    return body.error ?? CANCEL_INVALID_REQUEST_ERROR;
  }
  if (body.errorCode === "cancel_failed") {
    return body.error ?? CANCEL_FAILED_ERROR;
  }
  return body.error ?? CANCEL_FAILED_ERROR;
}

/**
 * Parse POST /cancel `alsoCancelled` sibling runId (paired cascade).
 * Returns null when absent / empty.
 */
export function parseAlsoCancelledRunId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

/** Stable English copy for the alsoCancelled run-detail hint. */
export function pairedCancelAlsoCopy(alsoCancelledRunId: string): string {
  return `Also cancelled the paired sibling ${alsoCancelledRunId}.`;
}

/**
 * Run detail Cancel button — same allow as POST /cancel (cancelGate),
 * including orphan budget_stop wind-down after poll timeout.
 */
export function runDetailCanCancel(opts: {
  status?: string;
  hasResult: boolean;
  cancelling?: boolean;
  cancelRequested?: boolean;
  pollError?: boolean;
}): boolean {
  if (opts.cancelling || opts.cancelRequested || opts.pollError) {
    return false;
  }
  const gate = cancelGate(opts.status, opts.hasResult);
  return gate.allow && !gate.alreadyCancelled;
}

export type RetryGateErrorCode =
  | "retry_still_finishing"
  | "retry_invalid_status"
  | "retry_non_retryable";

export type RetryGate =
  | { allow: true }
  | { allow: false; error: string; errorCode: RetryGateErrorCode };

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

/** Same copy for UI admission, GET retryAdmission, and POST /retry. */
export const RETRY_STILL_FINISHING_ERROR =
  "run still finishing — wait for result.json (or cancel) before retry";

/** POST /retry 404 — same literal as Cancel not-found. */
export const RETRY_NOT_FOUND_ERROR = "not found";

/**
 * Fail-closed when POST omits status detail (`cannot retry status ${current}`).
 */
export const RETRY_INVALID_STATUS_ERROR = "cannot retry status";

/** POST /retry + admission when evalSkillId/mode cannot be recovered. */
export const RETRY_CONFIG_MISSING_ERROR =
  "cannot retry — original job config missing (no failed job file or result)";

/** Gate deny when billing/account non-retryable (POST prefers status.errorCode). */
export const RETRY_NON_RETRYABLE_ERROR = "Cannot retry non-retryable error";

/** POST /retry catch / network — same literal as prior client fallback. */
export const RETRY_FAILED_ERROR = "Retry failed";

export const RETRY_INVALID_REQUEST_ERROR = "invalid request";

/**
 * Same copy as packages/core RETRY_ENQUEUE_LOCK_BUSY_ERROR (client-safe;
 * keep string in sync — no core import in this module).
 */
export const RETRY_ENQUEUE_LOCK_BUSY_ERROR =
  "retry already in progress — try again shortly";

/** POST /retry when tip link enqueue fails and meta revert also fails. */
export const RETRY_EVALUATION_META_REVERT_FAILED =
  "enqueue failed and Comparison tip revert failed — repair the pair shortly";

/**
 * Fail-closed default when Comparison tip link fails (POST may still send a
 * more specific error: before enqueue vs after enqueue abort).
 */
export const RETRY_COMPARISON_LINK_FAILED =
  "Comparison link update failed — try again shortly";

/** Pair-meta / official evaluation.json gates (same as retryPairMetaAdmission). */
export const RETRY_OFFICIAL_EVALUATION_META_MISSING =
  "official retry requires paired evaluation.json on disk (baseline↔candidate)";

export const RETRY_OFFICIAL_EVALUATION_LEG_MISMATCH =
  "paired retry parent runId is not a current Comparison meta leg — retry from the tip baseline/candidate";

/** Fail-closed when POST omits error detail (admission may still include roles). */
export const RETRY_OFFICIAL_EVALUATION_ROLE_SLOT_MISMATCH =
  "retry role does not match evaluation meta slot — retry from the tip baseline/candidate";

/** Snapshot pin gates (same as retrySnapshotGate). */
export const RETRY_SNAPSHOT_CANDIDATE_BLOCKED =
  "cannot retry candidate — skill-snapshot/SKILL.md missing or empty, or pinned evalSkillVersion missing; re-run from a finished candidate or start a new paired evaluation";

export const RETRY_SNAPSHOT_BASELINE_PIN_MISSING =
  "cannot retry baseline — pinned evalSkillVersion missing; re-run from a finished baseline or start a new paired evaluation";

/**
 * Billing/account codes that must not be retried — keep in sync with
 * packages/core NON_RETRYABLE_ERROR_CODES (client-safe local copy; no core import).
 */
export const RETRY_NON_RETRYABLE_ERROR_CODES = new Set([
  "insufficient_quota",
  "billing_not_active",
  "billing_hard_limit_reached",
  "account_deactivated",
]);

/** Same copy for billing/account non-retryable: admission, credit-alert, POST, onRetry. */
export const RETRY_INSUFFICIENT_QUOTA_BLOCKED =
  "No OpenAI credits remaining — add billing credits before retrying (not auto-retried).";

/** Same copy when preflight is red: admission blockedReason, POST /retry, onRetry. */
export const RETRY_PREFLIGHT_BLOCKED =
  "Retry blocked — preflight not green (API key, Docker, or worker). Open Settings, then retry.";

/**
 * enqueueRun fail paths on POST /retry (distinct from retry_enqueue_lock_busy,
 * which is the tip-link / retry-path lock — not jobs/.enqueue.lock).
 */
export const RETRY_ENQUEUE_QUEUE_FULL =
  "queue full — wait for pending jobs before retry";

export const RETRY_ENQUEUE_JOB_LOCK_BUSY =
  "enqueue lock busy — try again shortly";

export const RETRY_ENQUEUE_SKILL_NOT_READY =
  "skill not ready — fix import or pick another skill before retry";

/** POST /api/runs when preflight is red (distinct from retry_preflight_blocked). */
export const ENQUEUE_PREFLIGHT_BLOCKED =
  "Enqueue blocked — preflight not green (API key, Docker, or worker). Open Settings, then try again.";

/** Pair enqueue: evaluation.json write failed before job files. */
export const ENQUEUE_EVALUATION_META_FAILED =
  "failed to write evaluation.json — try again shortly";

/** Pair enqueue: candidate failed after baseline; pair rolled back. */
export const ENQUEUE_PAIR_CANDIDATE_FAILED =
  "candidate enqueue failed after baseline — pair rolled back; try again shortly";

/** POST /api/runs catch / NewRunForm network — same as prior "Enqueue failed". */
export const ENQUEUE_FAILED_ERROR = "Enqueue failed";

export const ENQUEUE_INVALID_REQUEST_ERROR = "invalid request";

/**
 * officialEnqueueAllowed errorCodes — client-safe copies (keep in sync with
 * packages/core officialAdmission.ts; no core import in this module).
 * Prefer body.error when present (web_auth / repeats include dynamic detail).
 */
export const OFFICIAL_ADMISSION_SMOKE_FORBIDDEN =
  "official mode requires live OpenAI produce — unset FAKE_PRODUCE (smoke is dry-run only)";

export const OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN =
  "official mode requires Docker grade — unset ALLOW_HOST_GRADE (host grade is smoke/CI only)";

export const OFFICIAL_ADMISSION_API_KEY_MISSING =
  "official mode requires OPENAI_API_KEY in .env";

export const OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED =
  "official mode requires WEB_AUTH_TOKEN (set a non-empty token; OFFICIAL_REQUIRES_WEB_AUTH is enabled)";

export const OFFICIAL_ADMISSION_PAIR_REQUIRED =
  "official mode requires baseline↔candidate pair (withBaseline) — single-leg official cannot unlock Benefit USE";

/** Fail-closed without body.error (API may include got N). OFFICIAL_MIN_REPEATS=3. */
export const OFFICIAL_ADMISSION_REPEATS_TOO_LOW =
  "official mode requires at least 3 repeats";

export const OFFICIAL_ADMISSION_EVALUATION_REQUIRED =
  "official mode requires evaluationId (paired baseline↔candidate) — refuse single-leg official jobs";

/**
 * officialEnqueueAllowed errorCodes → shared copy (null if not a known code).
 * Prefers body.error when provided (dynamic web_auth / repeats detail).
 */
export function officialAdmissionBlockedReason(
  errorCode?: string,
  bodyError?: string,
): string | null {
  const fromBody = bodyError?.trim();
  switch (errorCode) {
    case "official_smoke_forbidden":
      return fromBody || OFFICIAL_ADMISSION_SMOKE_FORBIDDEN;
    case "official_host_grade_forbidden":
      return fromBody || OFFICIAL_ADMISSION_HOST_GRADE_FORBIDDEN;
    case "official_api_key_missing":
      return fromBody || OFFICIAL_ADMISSION_API_KEY_MISSING;
    case "official_web_auth_required":
      return fromBody || OFFICIAL_ADMISSION_WEB_AUTH_REQUIRED;
    case "official_pair_required":
      return fromBody || OFFICIAL_ADMISSION_PAIR_REQUIRED;
    case "official_repeats_too_low":
      return fromBody || OFFICIAL_ADMISSION_REPEATS_TOO_LOW;
    case "official_evaluation_required":
      return fromBody || OFFICIAL_ADMISSION_EVALUATION_REQUIRED;
    default:
      return null;
  }
}

/**
 * Official Settings-not-Ready copy for Retry admission / POST /retry / onRetry.
 * Distinct from officialPilotReadyGate ("official mode blocked") used by new enqueue.
 */
export function retryOfficialPilotBlockedReason(blockers: string[]): string {
  return `Official retry blocked — Settings not Ready: ${blockers.join("; ")}.`;
}

/** True for OpenAI billing/account errorCodes that block Retry. */
export function isRetryBillingBlocked(errorCode?: string): boolean {
  return (
    typeof errorCode === "string" &&
    RETRY_NON_RETRYABLE_ERROR_CODES.has(errorCode)
  );
}

/** Shared blockedReason / POST error for billing non-retryable codes; null otherwise. */
export function retryNonRetryableBlockedReason(
  errorCode?: string,
): string | null {
  if (!isRetryBillingBlocked(errorCode)) return null;
  return RETRY_INSUFFICIENT_QUOTA_BLOCKED;
}

/**
 * Pair-meta / tip-revert errorCodes → shared copy (null if not a known code).
 * Role-slot prefers body.error when provided (includes concrete roles).
 */
export function retryPairMetaBlockedReason(
  errorCode?: string,
  bodyError?: string,
): string | null {
  switch (errorCode) {
    case "evaluation_meta_revert_failed":
      return RETRY_EVALUATION_META_REVERT_FAILED;
    case "official_evaluation_meta_missing":
      return RETRY_OFFICIAL_EVALUATION_META_MISSING;
    case "official_evaluation_leg_mismatch":
      return RETRY_OFFICIAL_EVALUATION_LEG_MISMATCH;
    case "official_evaluation_role_slot_mismatch":
      return bodyError?.trim()
        ? bodyError
        : RETRY_OFFICIAL_EVALUATION_ROLE_SLOT_MISMATCH;
    default:
      return null;
  }
}

export type RetryPostErrorBody = {
  error?: string;
  errorCode?: string;
  costCapUsd?: number;
  blockers?: string[];
};

/**
 * Map POST /retry JSON errorCodes to shared Retry copy (fail-closed when
 * error field is missing). Used by RunDetailClient onRetry.
 */
export function resolveRetryPostError(
  body: RetryPostErrorBody,
  formatCostBlocked: (costCapUsd: number) => string,
): string {
  if (
    body.errorCode === "enqueue_cost_over_cap" &&
    typeof body.costCapUsd === "number"
  ) {
    return formatCostBlocked(body.costCapUsd);
  }
  if (body.errorCode === "retry_preflight_blocked") {
    return RETRY_PREFLIGHT_BLOCKED;
  }
  if (
    body.errorCode === "official_pilot_not_ready" &&
    Array.isArray(body.blockers)
  ) {
    return retryOfficialPilotBlockedReason(body.blockers);
  }
  if (body.errorCode === "retry_enqueue_lock_busy") {
    return RETRY_ENQUEUE_LOCK_BUSY_ERROR;
  }
  if (body.errorCode === "enqueue_lock_busy") {
    return body.error ?? RETRY_ENQUEUE_JOB_LOCK_BUSY;
  }
  if (body.errorCode === "enqueue_queue_full") {
    return body.error ?? RETRY_ENQUEUE_QUEUE_FULL;
  }
  if (body.errorCode === "enqueue_skill_not_ready") {
    return body.error ?? RETRY_ENQUEUE_SKILL_NOT_READY;
  }
  if (body.errorCode === "retry_still_finishing") {
    return RETRY_STILL_FINISHING_ERROR;
  }
  if (body.errorCode === "retry_not_found") {
    return body.error ?? RETRY_NOT_FOUND_ERROR;
  }
  if (body.errorCode === "retry_invalid_status") {
    return body.error ?? RETRY_INVALID_STATUS_ERROR;
  }
  if (body.errorCode === "retry_config_missing") {
    return body.error ?? RETRY_CONFIG_MISSING_ERROR;
  }
  if (body.errorCode === "retry_non_retryable") {
    return body.error ?? RETRY_NON_RETRYABLE_ERROR;
  }
  if (body.errorCode === "retry_invalid_request") {
    return body.error ?? RETRY_INVALID_REQUEST_ERROR;
  }
  if (body.errorCode === "retry_failed") {
    return body.error ?? RETRY_FAILED_ERROR;
  }
  if (body.errorCode === "retry_snapshot_candidate_blocked") {
    return RETRY_SNAPSHOT_CANDIDATE_BLOCKED;
  }
  if (body.errorCode === "retry_snapshot_baseline_pin_missing") {
    return RETRY_SNAPSHOT_BASELINE_PIN_MISSING;
  }
  if (body.errorCode === "retry_comparison_link_failed") {
    return body.error ?? RETRY_COMPARISON_LINK_FAILED;
  }
  const admission = officialAdmissionBlockedReason(body.errorCode, body.error);
  if (admission) return admission;
  const pairMeta = retryPairMetaBlockedReason(body.errorCode, body.error);
  if (pairMeta) return pairMeta;
  const billing = retryNonRetryableBlockedReason(body.errorCode);
  if (billing) return billing;
  return body.error ?? RETRY_FAILED_ERROR;
}

export type EnqueuePostErrorBody = {
  error?: string;
  errorCode?: string;
  costCapUsd?: number;
  blockers?: string[];
};

/**
 * Map POST /api/runs JSON errorCodes to shared New-run copy (fail-closed when
 * error field is missing). Used by NewRunForm — not Retry (pair-only codes
 * live here; retry uses resolveRetryPostError).
 */
export function resolveEnqueuePostError(
  body: EnqueuePostErrorBody,
  formatCostBlocked: (costCapUsd: number) => string,
): string {
  if (
    body.errorCode === "enqueue_cost_over_cap" &&
    typeof body.costCapUsd === "number"
  ) {
    return formatCostBlocked(body.costCapUsd);
  }
  if (body.errorCode === "enqueue_preflight_blocked") {
    return ENQUEUE_PREFLIGHT_BLOCKED;
  }
  if (
    body.errorCode === "official_pilot_not_ready" &&
    Array.isArray(body.blockers)
  ) {
    return (
      body.error ??
      `official mode blocked — Settings not Ready: ${body.blockers.join("; ")}`
    );
  }
  if (body.errorCode === "enqueue_lock_busy") {
    return body.error ?? RETRY_ENQUEUE_JOB_LOCK_BUSY;
  }
  if (body.errorCode === "enqueue_queue_full") {
    return body.error ?? RETRY_ENQUEUE_QUEUE_FULL;
  }
  if (body.errorCode === "enqueue_skill_not_ready") {
    return body.error ?? RETRY_ENQUEUE_SKILL_NOT_READY;
  }
  if (body.errorCode === "enqueue_evaluation_meta_failed") {
    return body.error ?? ENQUEUE_EVALUATION_META_FAILED;
  }
  if (body.errorCode === "enqueue_pair_candidate_failed") {
    return body.error ?? ENQUEUE_PAIR_CANDIDATE_FAILED;
  }
  if (body.errorCode === "enqueue_invalid_request") {
    return body.error ?? ENQUEUE_INVALID_REQUEST_ERROR;
  }
  if (body.errorCode === "enqueue_failed") {
    return body.error ?? ENQUEUE_FAILED_ERROR;
  }
  const admission = officialAdmissionBlockedReason(body.errorCode, body.error);
  if (admission) return admission;
  return body.error ?? ENQUEUE_FAILED_ERROR;
}

/**
 * Shared orphan wait for budget_stop → result.json (run detail, Comparison,
 * Benefit pending). After this, final heal refresh + Cancel CTA — not Retry.
 */
export const WIND_DOWN_ORPHAN_MS = 90_000;

/**
 * Client-safe GET path for healRunForFinalize (orphan budget_stop → failed).
 * Keep here — do not import from healOrphans in client components (core/Node).
 */
export function runDetailFinalizeOrphansPath(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}?finalizeOrphans=1`;
}

/**
 * Orphan wind-down: status budget_stop but result.json not written yet
 * (even when .running.json was healed away). POST /retry and UI must agree.
 */
export function isRetryBudgetStopping(
  status: string | undefined,
  hasResult: boolean,
): boolean {
  return status === "budget_stop" && !hasResult;
}

/**
 * Whether Retry may enqueue a replacement run.
 * Live job files (queued/tmp/running) block even if status looks terminal
 * (e.g. budget_stop wind-down still writing result.json).
 */
export function retryGate(opts: {
  status: string | undefined;
  hasLiveJob: boolean;
  nonRetryableError?: boolean;
}): RetryGate {
  const current = opts.status ?? "unknown";
  if (!RETRYABLE.has(current)) {
    return {
      allow: false,
      error: `cannot retry status ${current}`,
      errorCode: "retry_invalid_status",
    };
  }
  if (opts.hasLiveJob) {
    return {
      allow: false,
      error: RETRY_STILL_FINISHING_ERROR,
      errorCode: "retry_still_finishing",
    };
  }
  if (opts.nonRetryableError) {
    return {
      allow: false,
      error: RETRY_NON_RETRYABLE_ERROR,
      errorCode: "retry_non_retryable",
    };
  }
  return { allow: true };
}

/** Statuses cascade cancel may consider when meta is missing. */
export function pairedCancelPeerStatuses(): Set<string> {
  return new Set([...CANCEL_ACTIVE, "budget_stop"]);
}

export type RetrySnapshotGate =
  | { allow: true; useSkillSnapshot: true }
  | {
      allow: false;
      error: string;
      errorCode:
        | "retry_snapshot_candidate_blocked"
        | "retry_snapshot_baseline_pin_missing";
    };

/**
 * Whether Retry may pin skillSnapshotFromRunId from the prior run.
 * Candidate needs non-empty SKILL.md + evalSkillVersion; baseline needs the
 * version pin so fixture drift cannot spend tokens before Comparison INCONCLUSIVE.
 */
export function retrySnapshotGate(opts: {
  role: "baseline" | "candidate";
  /** True only when skill-snapshot/SKILL.md exists and trim() is non-empty. */
  hasSkillMd: boolean;
  hasPinnedVersion: boolean;
}): RetrySnapshotGate {
  if (opts.role === "candidate") {
    if (!opts.hasSkillMd || !opts.hasPinnedVersion) {
      return {
        allow: false,
        error: RETRY_SNAPSHOT_CANDIDATE_BLOCKED,
        errorCode: "retry_snapshot_candidate_blocked",
      };
    }
    return { allow: true, useSkillSnapshot: true };
  }
  if (!opts.hasPinnedVersion) {
    return {
      allow: false,
      error: RETRY_SNAPSHOT_BASELINE_PIN_MISSING,
      errorCode: "retry_snapshot_baseline_pin_missing",
    };
  }
  return { allow: true, useSkillSnapshot: true };
}
