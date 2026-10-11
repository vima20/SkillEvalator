import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import { assertSafeId, resolveUnder } from "./paths.js";

/** Reuse a recent retry child instead of enqueueing another paid run. */
export const RETRY_DEDUP_WINDOW_MS = 60_000;

const ACTIVE_CHILD = new Set([
  "queued",
  "running",
  "cancel_requested",
]);

export type RetryMarker = {
  runId: string;
  at: string;
};

/** Pure helper: whether an existing retry child should be reused. */
export function shouldReuseRetry(opts: {
  markerAtMs: number;
  nowMs: number;
  windowMs?: number;
  childStatus: string | undefined;
}): boolean {
  const windowMs = opts.windowMs ?? RETRY_DEDUP_WINDOW_MS;
  if (!Number.isFinite(opts.markerAtMs)) return false;
  if (opts.nowMs - opts.markerAtMs > windowMs) return false;
  return ACTIVE_CHILD.has(opts.childStatus ?? "");
}

function markerPath(resultsDir: string, fromRunId: string): string {
  return path.join(
    resolveUnder(resultsDir, assertSafeId(fromRunId, "runId")),
    "retry-of.json",
  );
}

export function loadRetryMarker(
  resultsDir: string,
  fromRunId: string,
): RetryMarker | null {
  const p = markerPath(resultsDir, fromRunId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<RetryMarker>;
    if (typeof raw.runId !== "string" || typeof raw.at !== "string") return null;
    assertSafeId(raw.runId, "runId");
    return { runId: raw.runId, at: raw.at };
  } catch {
    return null;
  }
}

export function saveRetryMarker(
  resultsDir: string,
  fromRunId: string,
  childRunId: string,
): void {
  writeJsonFile(markerPath(resultsDir, fromRunId), {
    runId: assertSafeId(childRunId, "runId"),
    at: new Date().toISOString(),
  } satisfies RetryMarker);
}

/**
 * If a recent retry child is still queued/running, return its runId.
 * Caller supplies child status loader to keep this free of listRuns coupling.
 */
export function findReusableRetryRunId(
  resultsDir: string,
  fromRunId: string,
  loadChildStatus: (childRunId: string) => string | undefined,
  nowMs = Date.now(),
): string | null {
  const marker = loadRetryMarker(resultsDir, fromRunId);
  if (!marker) return null;
  const atMs = Date.parse(marker.at);
  const childStatus = loadChildStatus(marker.runId);
  if (
    !shouldReuseRetry({
      markerAtMs: atMs,
      nowMs,
      childStatus,
    })
  ) {
    return null;
  }
  return marker.runId;
}
