/** Client-safe badge helpers (avoid importing Node core barrel). */

export type StatusBadgeKind = "ok" | "run" | "fail" | "wait";

export function statusBadgeKind(status?: string | null): StatusBadgeKind {
  switch (status) {
    case "ok":
      return "ok";
    case "running":
    case "queued":
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
