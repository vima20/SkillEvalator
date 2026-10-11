import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import {
  heartbeatOwnsRunFs,
  isWorkerHeartbeatLive,
  parseWorkerPidRecord,
} from "./jobQueueFs.js";
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

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * True when the child status is still backed by a live job / worker.
 * Prevents Retry from reusing a zombie queued/running marker.
 */
export function isRetryChildLive(opts: {
  jobsDir: string;
  childRunId: string;
  childStatus: string | undefined;
  isPidAlive?: (pid: number) => boolean;
  nowMs?: number;
}): boolean {
  const status = opts.childStatus ?? "";
  if (!ACTIVE_CHILD.has(status)) return false;

  const id = assertSafeId(opts.childRunId, "runId");
  const nowMs = opts.nowMs ?? Date.now();
  const isPidAlive = opts.isPidAlive ?? defaultIsPidAlive;

  if (status === "queued") {
    const hasJob =
      fs.existsSync(path.join(opts.jobsDir, `${id}.json`)) ||
      fs.existsSync(path.join(opts.jobsDir, `${id}.tmp.json`));
    if (!hasJob) return false;
    // Job file alone is not enough — worker may be dead while status stays queued.
    return isWorkerHeartbeatLive(opts.jobsDir, {
      nowMs,
      isPidAlive,
    });
  }

  const runningPath = path.join(opts.jobsDir, `${id}.running.json`);
  if (!fs.existsSync(runningPath)) return false;

  const pidFile = path.join(opts.jobsDir, `${id}.worker.pid`);
  if (!fs.existsSync(pidFile)) return false;

  try {
    const rec = parseWorkerPidRecord(fs.readFileSync(pidFile, "utf8"));
    if (!rec || !isPidAlive(rec.pid)) return false;
    return heartbeatOwnsRunFs(opts.jobsDir, id, rec.pid, nowMs);
  } catch {
    return false;
  }
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
 * If a recent retry child is still queued/running and live on disk, return its runId.
 * Caller supplies child status loader to keep this free of listRuns coupling.
 */
export function findReusableRetryRunId(
  resultsDir: string,
  fromRunId: string,
  loadChildStatus: (childRunId: string) => string | undefined,
  opts: {
    jobsDir: string;
    nowMs?: number;
    isPidAlive?: (pid: number) => boolean;
  },
): string | null {
  const marker = loadRetryMarker(resultsDir, fromRunId);
  if (!marker) return null;
  const nowMs = opts.nowMs ?? Date.now();
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
  if (
    !isRetryChildLive({
      jobsDir: opts.jobsDir,
      childRunId: marker.runId,
      childStatus,
      isPidAlive: opts.isPidAlive,
      nowMs,
    })
  ) {
    return null;
  }
  return marker.runId;
}
