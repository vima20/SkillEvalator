/** Client-safe badge helpers (avoid importing Node core barrel). */

export type StatusBadgeKind = "ok" | "run" | "fail" | "wait";

const ACTIVE_RUN = new Set(["queued", "running", "cancel_requested"]);

/**
 * True while a run may still change (refresh-worthy). Safe for RSC + client.
 * `budget_stop` is active only until result.json lands (wind-down); with a
 * terminal result it must not keep dashboard/runs auto-refreshing forever.
 */
export function runIsActive(
  status: string | undefined,
  hasResult = false,
): boolean {
  const s = status ?? "";
  if (s === "budget_stop") return !hasResult;
  return ACTIVE_RUN.has(s);
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
