/**
 * Shared cancel / retry gate decisions for Unikie run lifecycle.
 * Kept pure so apps/web vitest can lock integrity regressions without Next.
 */

const CANCEL_TERMINAL = new Set(["ok", "failed", "cancelled"]);
const CANCEL_ACTIVE = new Set(["queued", "running", "cancel_requested"]);

export type CancelGate =
  | { allow: true; alreadyCancelled?: boolean }
  | { allow: false; error: string };

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
    return { allow: false, error: `run already finished (${current})` };
  }
  if (current === "budget_stop") {
    if (hasResult) {
      return { allow: false, error: `run already finished (${current})` };
    }
    return { allow: true };
  }
  if (!CANCEL_ACTIVE.has(current)) {
    return { allow: false, error: `cannot cancel status ${current}` };
  }
  return { allow: true };
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
  | { allow: false; error: string };

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

/** Same copy for UI admission, GET retryAdmission, and POST /retry. */
export const RETRY_STILL_FINISHING_ERROR =
  "run still finishing — wait for result.json (or cancel) before retry";

/**
 * Shared orphan wait for budget_stop → result.json (run detail, Comparison,
 * Benefit pending). After this, final heal refresh + Cancel CTA — not Retry.
 */
export const WIND_DOWN_ORPHAN_MS = 90_000;

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
  | { allow: false; error: string };

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
        error:
          "cannot retry candidate — skill-snapshot/SKILL.md missing or empty, or pinned evalSkillVersion missing; re-run from a finished candidate or start a new paired evaluation",
      };
    }
    return { allow: true, useSkillSnapshot: true };
  }
  if (!opts.hasPinnedVersion) {
    return {
      allow: false,
      error:
        "cannot retry baseline — pinned evalSkillVersion missing; re-run from a finished baseline or start a new paired evaluation",
    };
  }
  return { allow: true, useSkillSnapshot: true };
}
