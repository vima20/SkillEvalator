/** Client-safe badge helpers (avoid importing Node core barrel). */

export type StatusBadgeKind = "ok" | "run" | "fail" | "wait";

const ACTIVE_RUN = new Set([
  "queued",
  "running",
  "cancel_requested",
  // Mid-finish cost-cap wind-down before result.json lands.
  "budget_stop",
]);

/** True while a run may still change (refresh-worthy). Safe for RSC + client. */
export function runIsActive(status: string | undefined): boolean {
  return ACTIVE_RUN.has(status ?? "");
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
