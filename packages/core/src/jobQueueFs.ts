import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import { syncStatusFromResult } from "./results.js";

/** Match web preflight busy stale window — heartbeat older than this cannot own a run. */
export const WORKER_HEARTBEAT_BUSY_STALE_MS = 15 * 60_000;

export type OrphanRunningAction =
  | "skip_alive"
  | "finalize_done"
  /** Incomplete orphan: fail instead of requeue (avoids OpenAI double-spend). */
  | "fail_orphan";

export type WorkerPidRecord = {
  pid: number;
  runId?: string;
  at?: string;
};

/** Pure decision helper for orphan .running jobs (unit-tested). */
export function decideOrphanRunningAction(opts: {
  pidAlive: boolean | null;
  hasResult: boolean;
  /** .worker heartbeat proves this PID still owns this runId. */
  heartbeatOwnsRun: boolean;
}): OrphanRunningAction {
  // PID alone is not enough (OS PID reuse); require heartbeat ownership.
  if (opts.pidAlive === true && opts.heartbeatOwnsRun) return "skip_alive";
  if (opts.hasResult) return "finalize_done";
  return "fail_orphan";
}

/** Parse plain pid text or JSON `{ pid, runId, at }`. */
export function parseWorkerPidRecord(raw: string): WorkerPidRecord | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as {
        pid?: unknown;
        runId?: unknown;
        at?: unknown;
      };
      const pid = Number(obj.pid);
      if (!Number.isInteger(pid) || pid <= 0) return null;
      return {
        pid,
        ...(typeof obj.runId === "string" ? { runId: obj.runId } : {}),
        ...(typeof obj.at === "string" ? { at: obj.at } : {}),
      };
    } catch {
      return null;
    }
  }
  const pid = Number(trimmed);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid };
}

export function formatWorkerPidRecord(rec: WorkerPidRecord): string {
  return JSON.stringify({
    pid: rec.pid,
    ...(rec.runId ? { runId: rec.runId } : {}),
    at: rec.at ?? new Date().toISOString(),
  });
}

/**
 * True when jobsDir/.worker is fresh, same pid, and runId matches (or unset busy).
 */
export function heartbeatOwnsRunFs(
  jobsDir: string,
  runId: string,
  pid: number,
  nowMs = Date.now(),
  staleMs = WORKER_HEARTBEAT_BUSY_STALE_MS,
): boolean {
  const hbPath = path.join(jobsDir, ".worker");
  if (!fs.existsSync(hbPath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(hbPath, "utf8")) as {
      pid?: unknown;
      at?: unknown;
      busy?: unknown;
      runId?: unknown;
    };
    if (Number(raw.pid) !== pid) return false;
    const at = typeof raw.at === "string" ? Date.parse(raw.at) : NaN;
    if (!Number.isFinite(at) || nowMs - at > staleMs) return false;
    if (typeof raw.runId === "string" && raw.runId.length > 0) {
      return raw.runId === runId;
    }
    // Fresh heartbeat without runId: only trust briefly (between tasks).
    return nowMs - at <= 20_000;
  } catch {
    return false;
  }
}

function workerPidPath(runningJobPath: string): string {
  return runningJobPath.replace(/\.running\.json$/, ".worker.pid");
}

function runIdFromJobPath(jobPath: string): string | null {
  const base = path
    .basename(jobPath)
    .replace(/\.running\.json$/, "")
    .replace(/\.failed\.json$/, "")
    .replace(/\.done\.json$/, "")
    .replace(/\.cancelled\.json$/, "")
    .replace(/\.tmp\.json$/, "")
    .replace(/\.json$/, "");
  return /^run_[A-Za-z0-9._-]+$/.test(base) ? base : null;
}

function finalizeRunningJob(
  runningPath: string,
  outcome: "done" | "failed",
): void {
  const target = runningPath.replace(/\.running\.json$/, `.${outcome}.json`);
  const pidFile = workerPidPath(runningPath);
  try {
    if (fs.existsSync(runningPath)) {
      if (fs.existsSync(target)) fs.unlinkSync(runningPath);
      else fs.renameSync(runningPath, target);
    }
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

function markOrphanRunningFailed(resultsDir: string, runId: string): void {
  const statusPath = path.join(resultsDir, runId, "status.json");
  writeJsonFile(statusPath, {
    runId,
    status: "failed",
    error:
      "Worker died mid-run; job was not re-queued to avoid duplicate OpenAI spend. Use Retry for a new run.",
    errorCode: "orphan_running",
  });
}

/**
 * Reclaim .running jobs when worker PID is dead/missing or heartbeat does not own the run.
 * - result.json present → finalize .done (never re-queue)
 * - incomplete → finalize .failed + status orphan_running (never re-queue)
 */
export function reclaimOrphanRunningJobsFs(
  jobsDir: string,
  resultsDir: string,
  isPidAlive: (pid: number) => boolean,
): { finalized: string[]; failed: string[] } {
  const finalized: string[] = [];
  const failed: string[] = [];
  if (!fs.existsSync(jobsDir)) return { finalized, failed };

  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".running.json")) continue;
    const running = path.join(jobsDir, name);
    const pidFile = workerPidPath(running);
    const runId = runIdFromJobPath(running);

    let pidAlive: boolean | null = null;
    let heartbeatOwnsRun = false;
    if (fs.existsSync(pidFile)) {
      try {
        const rec = parseWorkerPidRecord(fs.readFileSync(pidFile, "utf8"));
        if (!rec) {
          pidAlive = false;
        } else {
          pidAlive = isPidAlive(rec.pid);
          if (pidAlive && runId) {
            heartbeatOwnsRun = heartbeatOwnsRunFs(jobsDir, runId, rec.pid);
          }
        }
      } catch {
        pidAlive = false;
      }
    } else {
      pidAlive = false;
    }

    const hasResult = Boolean(
      runId && fs.existsSync(path.join(resultsDir, runId, "result.json")),
    );
    const action = decideOrphanRunningAction({
      pidAlive,
      hasResult,
      heartbeatOwnsRun,
    });
    if (action === "skip_alive") continue;
    if (action === "finalize_done") {
      finalizeRunningJob(running, "done");
      if (runId) syncStatusFromResult(resultsDir, runId);
      finalized.push(name);
      continue;
    }
    finalizeRunningJob(running, "failed");
    if (runId) markOrphanRunningFailed(resultsDir, runId);
    failed.push(name);
  }
  return { finalized, failed };
}

/**
 * Fix status.json stuck at queued when no job file exists; remove stale .tmp.json.
 */
export function cleanupOrphanQueuedFs(
  jobsDir: string,
  resultsDir: string,
): { failedStatuses: string[]; removedTmp: string[] } {
  const failedStatuses: string[] = [];
  const removedTmp: string[] = [];
  fs.mkdirSync(jobsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".tmp.json")) continue;
    const p = path.join(jobsDir, name);
    try {
      fs.unlinkSync(p);
      removedTmp.push(name);
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(resultsDir)) return { failedStatuses, removedTmp };

  for (const runId of fs.readdirSync(resultsDir)) {
    if (!/^run_[A-Za-z0-9._-]+$/.test(runId)) continue;
    const statusPath = path.join(resultsDir, runId, "status.json");
    if (!fs.existsSync(statusPath)) continue;
    let status = "unknown";
    try {
      const raw = JSON.parse(fs.readFileSync(statusPath, "utf8")) as {
        status?: string;
      };
      status = raw.status ?? "unknown";
    } catch {
      continue;
    }
    if (status !== "queued") continue;

    const hasJob =
      fs.existsSync(path.join(jobsDir, `${runId}.json`)) ||
      fs.existsSync(path.join(jobsDir, `${runId}.running.json`)) ||
      fs.existsSync(path.join(jobsDir, `${runId}.tmp.json`));
    if (hasJob) continue;

    writeJsonFile(statusPath, {
      runId,
      status: "failed",
      error: "orphaned queued status (job file missing)",
      errorCode: "orphan_queued",
    });
    failedStatuses.push(runId);
  }

  return { failedStatuses, removedTmp };
}

/**
 * Heal status.json stuck at running with no job file (and optional result sync).
 */
export function cleanupOrphanRunningStatusFs(
  jobsDir: string,
  resultsDir: string,
): { synced: string[]; failedStatuses: string[] } {
  const synced: string[] = [];
  const failedStatuses: string[] = [];
  if (!fs.existsSync(resultsDir)) return { synced, failedStatuses };
  fs.mkdirSync(jobsDir, { recursive: true });

  for (const runId of fs.readdirSync(resultsDir)) {
    if (!/^run_[A-Za-z0-9._-]+$/.test(runId)) continue;
    const statusPath = path.join(resultsDir, runId, "status.json");
    if (!fs.existsSync(statusPath)) continue;
    let status = "unknown";
    try {
      const raw = JSON.parse(fs.readFileSync(statusPath, "utf8")) as {
        status?: string;
      };
      status = raw.status ?? "unknown";
    } catch {
      continue;
    }
    if (status !== "running") continue;

    const hasJob =
      fs.existsSync(path.join(jobsDir, `${runId}.json`)) ||
      fs.existsSync(path.join(jobsDir, `${runId}.running.json`));
    if (hasJob) continue;

    const hasResult = fs.existsSync(
      path.join(resultsDir, runId, "result.json"),
    );
    if (hasResult) {
      syncStatusFromResult(resultsDir, runId);
      synced.push(runId);
      continue;
    }

    writeJsonFile(statusPath, {
      runId,
      status: "failed",
      error:
        "Orphaned running status (no job file). Use Retry for a new run.",
      errorCode: "orphan_running",
    });
    failedStatuses.push(runId);
  }

  return { synced, failedStatuses };
}
