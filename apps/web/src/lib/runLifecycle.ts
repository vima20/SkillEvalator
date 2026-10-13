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

export type RetryGate =
  | { allow: true }
  | { allow: false; error: string };

const RETRYABLE = new Set(["failed", "cancelled", "budget_stop"]);

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
      error:
        "run still finishing — wait for result.json (or cancel) before retry",
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
