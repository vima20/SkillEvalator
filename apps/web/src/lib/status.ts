/** Client-safe badge helpers (avoid importing Node core barrel). */

export type StatusBadgeKind = "ok" | "run" | "fail" | "wait";

const ACTIVE_RUN = new Set(["queued", "running", "cancel_requested"]);

/**
 * True while a run may still change (refresh-worthy). Safe for RSC + client.
 * `budget_stop` is active only until result.json lands (wind-down); with a
 * terminal result it must not keep dashboard/runs auto-refreshing forever.
 * Missing / `unknown` (status.json lag) stays active until a result exists.
 */
export function runIsActive(
  status: string | undefined,
  hasResult = false,
): boolean {
  const s = status ?? "";
  if (s === "budget_stop") return !hasResult;
  if (ACTIVE_RUN.has(s)) return true;
  if (!s || s === "unknown") return !hasResult;
  return false;
}

const BENEFIT_SETTLED = new Set(["ok", "failed", "cancelled"]);

/**
 * BenefitPending wait/unavailable gates (pure — vitest without React).
 * Poll while not settled and budget wind-down has not orphan-timed-out,
 * including missing/`unknown` status (status.json may lag result.json).
 * `orphanStuck`: timed-out budget_stop without result — open run for Cancel/heal.
 */
export function benefitPendingState(opts: {
  status?: string | null;
  budgetTimedOut: boolean;
}): {
  windDown: boolean;
  stillWaiting: boolean;
  unavailable: boolean;
  orphanStuck: boolean;
} {
  const st = opts.status ?? undefined;
  const windDown = st === "budget_stop";
  const settled = BENEFIT_SETTLED.has(st ?? "");
  const orphanStuck = windDown && opts.budgetTimedOut;
  const stillWaiting = !settled && !orphanStuck;
  const unavailable = settled || orphanStuck;
  return { windDown, stillWaiting, unavailable, orphanStuck };
}

export type ComparisonLegPending = {
  status?: string;
  hasResult: boolean;
  budgetTimedOut: boolean;
};

export type ComparisonPendingGates = {
  baselineWindDown: boolean;
  candidateWindDown: boolean;
  windDown: boolean;
  stillWaiting: boolean;
  unavailable: boolean;
  /** At least one tip is orphan budget_stop after timeout — Cancel/Refresh on run. */
  orphanStuck: boolean;
};

function comparisonLegWindDown(leg: ComparisonLegPending): boolean {
  return leg.status === "budget_stop" && !leg.hasResult;
}

function comparisonLegActive(leg: ComparisonLegPending): boolean {
  const windDown = comparisonLegWindDown(leg);
  if (windDown && leg.budgetTimedOut) return false;
  return runIsActive(leg.status, leg.hasResult);
}

function comparisonLegSettled(leg: ComparisonLegPending): boolean {
  const s = leg.status ?? "";
  if (BENEFIT_SETTLED.has(s)) return true;
  if (s === "budget_stop") {
    return leg.hasResult || leg.budgetTimedOut;
  }
  // Result landed while status.json lags as missing/unknown — do not leave
  // ComparisonPending in !stillWaiting && !unavailable limbo.
  if (leg.hasResult && !ACTIVE_RUN.has(s)) return true;
  return false;
}

/**
 * ComparisonPending wait/unavailable gates (pure — vitest without React).
 * Per-leg wind-down clocks; unknown+hasResult settles the leg.
 */
export function comparisonPendingState(opts: {
  baseline: ComparisonLegPending;
  candidate: ComparisonLegPending;
}): ComparisonPendingGates {
  const baselineWindDown = comparisonLegWindDown(opts.baseline);
  const candidateWindDown = comparisonLegWindDown(opts.candidate);
  const stillWaiting =
    comparisonLegActive(opts.baseline) || comparisonLegActive(opts.candidate);
  const unavailable =
    !stillWaiting &&
    comparisonLegSettled(opts.baseline) &&
    comparisonLegSettled(opts.candidate);
  const orphanStuck =
    unavailable &&
    ((baselineWindDown && opts.baseline.budgetTimedOut) ||
      (candidateWindDown && opts.candidate.budgetTimedOut));
  return {
    baselineWindDown,
    candidateWindDown,
    windDown: baselineWindDown || candidateWindDown,
    stillWaiting,
    unavailable,
    orphanStuck,
  };
}

export function statusBadgeKind(status?: string | null): StatusBadgeKind {
  switch (status) {
    case "ok":
      return "ok";
    case "running":
    case "queued":
    case "cancel_requested":
      return "run";
    case "failed":
    case "cancelled":
    case "budget_stop":
      return "fail";
    default:
      return "wait";
  }
}

export function statusBadgeClass(status?: string | null): string {
  return `badge badge-${statusBadgeKind(status)}`;
}
