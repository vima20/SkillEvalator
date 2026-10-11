import type { RunResult } from "./schema.js";

export type RunStatus = RunResult["status"];

export type StatusBadgeKind = "ok" | "run" | "fail" | "wait";

/**
 * Mid-run status.json value while the worker is still looping.
 * Preserve cancel_requested so the UI does not flip back to "running".
 */
export function liveRunStatusForProgress(opts: {
  stop: "cancelled" | "budget_stop" | null;
  cancelFilePresent: boolean;
}): "running" | "cancel_requested" {
  if (opts.stop === "cancelled" || opts.cancelFilePresent) {
    return "cancel_requested";
  }
  return "running";
}

/**
 * Final stop after the produce/grade loop.
 * A late .cancel file must win over a would-be ok / budget_stop finish.
 */
export function resolveFinalRunStop(opts: {
  stop: "cancelled" | "budget_stop" | null;
  cancelFilePresent: boolean;
}): "cancelled" | "budget_stop" | null {
  if (opts.stop === "cancelled" || opts.cancelFilePresent) {
    return "cancelled";
  }
  return opts.stop;
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
