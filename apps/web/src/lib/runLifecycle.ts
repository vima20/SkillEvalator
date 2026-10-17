/**
 * Shared cancel / retry gate decisions for Unikie run lifecycle.
 * Kept pure so apps/web vitest can lock integrity regressions without Next.
 */

const CANCEL_TERMINAL = new Set(["ok", "failed", "cancelled"]);
const CANCEL_ACTIVE = new Set(["queued", "running", "cancel_requested"]);

export type CancelErrorCode =
  | "cancel_run_already_finished"
  | "cancel_invalid_status"
  | "cancel_not_found";

export const CANCEL_NOT_FOUND_ERROR = "not found";

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
  return body.error ?? "Cancel failed";
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

export type RetryGate =
  | { allow: true }
  | { allow: false; error: string; errorCode?: "retry_still_finishing" };

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

/** Same copy for UI admission, GET retryAdmission, and POST /retry. */
export const RETRY_STILL_FINISHING_ERROR =
  "run still finishing — wait for result.json (or cancel) before retry";

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
  if (body.errorCode === "retry_still_finishing") {
    return RETRY_STILL_FINISHING_ERROR;
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
  const pairMeta = retryPairMetaBlockedReason(body.errorCode, body.error);
  if (pairMeta) return pairMeta;
  const billing = retryNonRetryableBlockedReason(body.errorCode);
  if (billing) return billing;
  return body.error ?? "Retry failed";
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
    return { allow: false, error: `cannot retry status ${current}` };
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
      error: "Cannot retry non-retryable error",
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
