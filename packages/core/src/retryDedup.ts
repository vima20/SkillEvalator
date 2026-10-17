import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import { releaseWxLock, tryAcquireWxLock } from "./fsSafe.js";
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

/** Drop retry-of.json so a rolled-back enqueue is not reused as a live child. */
export function clearRetryMarker(
  resultsDir: string,
  fromRunId: string,
): void {
  try {
    fs.unlinkSync(markerPath(resultsDir, fromRunId));
  } catch {
    /* ignore missing */
  }
}

function retryLockPath(resultsDir: string, fromRunId: string): string {
  return path.join(
    resolveUnder(resultsDir, assertSafeId(fromRunId, "runId")),
    "retry-enqueue.lock",
  );
}

/** Same copy as POST /retry when tryAcquireRetryEnqueueLock fails. */
export const RETRY_ENQUEUE_LOCK_BUSY_ERROR =
  "retry already in progress — try again shortly";

/**
 * Read-only peep: fresh retry-enqueue.lock exists (same stale window as acquire).
 * Used by GET retry admission so UI does not show canRetry while POST would 409.
 */
export function isRetryEnqueueLockBusy(
  resultsDir: string,
  fromRunId: string,
  nowMs = Date.now(),
): boolean {
  try {
    const lock = retryLockPath(resultsDir, fromRunId);
    if (!fs.existsSync(lock)) return false;
    const age = nowMs - fs.statSync(lock).mtimeMs;
    return Number.isFinite(age) && age <= RETRY_DEDUP_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Exclusive lock so concurrent Retry POSTs cannot each enqueue a paid run.
 * Stale locks older than RETRY_DEDUP_WINDOW_MS are stolen via unlink+wx.
 */
export function tryAcquireRetryEnqueueLock(
  resultsDir: string,
  fromRunId: string,
  _nowMs = Date.now(),
): boolean {
  return tryAcquireWxLock(retryLockPath(resultsDir, fromRunId), {
    staleMs: RETRY_DEDUP_WINDOW_MS,
    retries: 0,
  });
}

export function releaseRetryEnqueueLock(
  resultsDir: string,
  fromRunId: string,
): void {
  releaseWxLock(retryLockPath(resultsDir, fromRunId));
}

/**
 * If a recent retry child is still queued/running and live on disk, return its runId.
 * Caller supplies child status loader to keep this free of listRuns coupling.
 */
/** Cap retry-of walks so a corrupt cycle cannot hang Comparison load. */
export const RETRY_CHAIN_MAX_HOPS = 8;

export type RetryChainLegInfo = {
  evaluationId?: string;
  role?: string;
  status?: string;
};

/**
 * Follow retry-of.json from a Comparison meta leg to the newest same-eval /
 * same-role child. Used when meta still points at a failed/cancelled parent
 * after a paid retry child was enqueued (meta-link 503 / lock race).
 * Does not scan readdir — only explicit lineage markers.
 */
export function resolveLegRunIdViaRetryChain(opts: {
  resultsDir: string;
  fromRunId: string;
  evaluationId: string;
  role: "baseline" | "candidate";
  loadLeg: (runId: string) => RetryChainLegInfo | null;
  loadMarker?: (
    resultsDir: string,
    fromRunId: string,
  ) => RetryMarker | null;
  maxHops?: number;
}): { runId: string; hops: number } {
  const maxHops = opts.maxHops ?? RETRY_CHAIN_MAX_HOPS;
  const loadMarker = opts.loadMarker ?? loadRetryMarker;
  let current: string;
  try {
    current = assertSafeId(opts.fromRunId, "runId");
  } catch {
    return { runId: opts.fromRunId, hops: 0 };
  }
  const seen = new Set<string>([current]);
  let hops = 0;

  while (hops < maxHops) {
    const marker = loadMarker(opts.resultsDir, current);
    if (!marker) break;
    let childId: string;
    try {
      childId = assertSafeId(marker.runId, "runId");
    } catch {
      break;
    }
    if (seen.has(childId)) break;
    const leg = opts.loadLeg(childId);
    if (!leg) break;
    if (leg.evaluationId !== opts.evaluationId) break;
    if (leg.role !== opts.role) break;
    seen.add(childId);
    current = childId;
    hops += 1;
  }

  return { runId: current, hops };
}

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
