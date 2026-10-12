import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";
import { syncStatusFromResult } from "./results.js";

/** Match web preflight busy stale window — heartbeat older than this cannot own a run. */
export const WORKER_HEARTBEAT_BUSY_STALE_MS = 15 * 60_000;

/** Match web preflight idle stale window. */
export const WORKER_HEARTBEAT_IDLE_STALE_MS = 20_000;

/**
 * After claim writes .running.json + .worker.pid, allow a short window
 * before heartbeat has runId — avoid web heal failing a just-started job.
 */
export const RUNNING_CLAIM_GRACE_MS = 30_000;

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
  /** Fresh claim — skip fail until heartbeat can catch up. */
  withinClaimGrace?: boolean;
}): OrphanRunningAction {
  // PID alone is not enough (OS PID reuse); require heartbeat ownership.
  if (opts.pidAlive === true && opts.heartbeatOwnsRun) return "skip_alive";
  // Claim→first heartbeat race: pid alive and files just written.
  if (opts.pidAlive === true && opts.withinClaimGrace) return "skip_alive";
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
 * True when jobsDir/.worker is fresh, same pid, and runId matches.
 * Idle heartbeats without runId never own a specific run (avoids PID-reuse
 * skip_alive that leaves zombie .running.json stuck).
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
    if (typeof raw.runId !== "string" || raw.runId.length === 0) return false;
    return raw.runId === runId;
  } catch {
    return false;
  }
}

/**
 * True when jobsDir/.worker has a live PID and a fresh timestamp
 * (same windows as web preflight).
 */
export function isWorkerHeartbeatLive(
  jobsDir: string,
  opts?: {
    nowMs?: number;
    isPidAlive?: (pid: number) => boolean;
    idleStaleMs?: number;
    busyStaleMs?: number;
  },
): boolean {
  const nowMs = opts?.nowMs ?? Date.now();
  const idleStaleMs = opts?.idleStaleMs ?? WORKER_HEARTBEAT_IDLE_STALE_MS;
  const busyStaleMs = opts?.busyStaleMs ?? WORKER_HEARTBEAT_BUSY_STALE_MS;
  const isPidAlive =
    opts?.isPidAlive ??
    ((pid: number) => {
      if (!Number.isInteger(pid) || pid <= 0) return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });

  const hbPath = path.join(jobsDir, ".worker");
  if (!fs.existsSync(hbPath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(hbPath, "utf8")) as {
      pid?: unknown;
      at?: unknown;
      busy?: unknown;
    };
    const pid = Number(raw.pid);
    if (!isPidAlive(pid)) return false;
    const at = typeof raw.at === "string" ? Date.parse(raw.at) : NaN;
    if (!Number.isFinite(at)) return false;
    const staleLimit = raw.busy ? busyStaleMs : idleStaleMs;
    return nowMs - at <= staleLimit;
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

function readStatusPrior(statusPath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(statusPath)) return {};
    return JSON.parse(fs.readFileSync(statusPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function pairingFieldsFromPrior(prior: Record<string, unknown>): {
  role?: "baseline" | "candidate";
  evaluationId?: string;
  costUsd?: number;
} {
  return {
    ...(prior.role === "baseline" || prior.role === "candidate"
      ? { role: prior.role }
      : {}),
    ...(typeof prior.evaluationId === "string"
      ? { evaluationId: prior.evaluationId }
      : {}),
    ...(typeof prior.costUsd === "number" ? { costUsd: prior.costUsd } : {}),
  };
}

function markOrphanRunningFailed(resultsDir: string, runId: string): void {
  const statusPath = path.join(resultsDir, runId, "status.json");
  const prior = readStatusPrior(statusPath);
  writeJsonFile(statusPath, {
    ...pairingFieldsFromPrior(prior),
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

    let withinClaimGrace = false;
    if (pidAlive === true) {
      try {
        const runningAge = Date.now() - fs.statSync(running).mtimeMs;
        const pidAge = fs.existsSync(pidFile)
          ? Date.now() - fs.statSync(pidFile).mtimeMs
          : Number.POSITIVE_INFINITY;
        withinClaimGrace =
          Math.min(runningAge, pidAge) < RUNNING_CLAIM_GRACE_MS;
      } catch {
        withinClaimGrace = false;
      }
    }

    const hasResult = Boolean(
      runId && fs.existsSync(path.join(resultsDir, runId, "result.json")),
    );
    const action = decideOrphanRunningAction({
      pidAlive,
      hasResult,
      heartbeatOwnsRun,
      withinClaimGrace,
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

/** Only delete enqueue tmp files older than this (avoid racing live writes). */
export const STALE_TMP_JOB_MS = 60_000;

/**
 * status.json is written before the job file during enqueue — wait this long
 * before treating a queued status without a job as orphaned.
 */
export const QUEUED_ENQUEUE_GRACE_MS = 30_000;

/**
 * Heal one run stuck at queued with no job / tmp file.
 * Returns failed | noop.
 */
export function healOrphanQueuedStatusFs(
  jobsDir: string,
  resultsDir: string,
  runId: string,
  opts?: { nowMs?: number; graceMs?: number },
): "failed" | "noop" {
  if (!/^run_[A-Za-z0-9._-]+$/.test(runId)) return "noop";
  const statusPath = path.join(resultsDir, runId, "status.json");
  if (!fs.existsSync(statusPath)) return "noop";

  let status = "unknown";
  try {
    const raw = JSON.parse(fs.readFileSync(statusPath, "utf8")) as {
      status?: string;
    };
    status = raw.status ?? "unknown";
  } catch {
    return "noop";
  }
  if (status !== "queued") return "noop";

  const hasJob =
    fs.existsSync(path.join(jobsDir, `${runId}.json`)) ||
    fs.existsSync(path.join(jobsDir, `${runId}.running.json`)) ||
    fs.existsSync(path.join(jobsDir, `${runId}.tmp.json`));
  if (hasJob) return "noop";

  // Enqueue race: status lands before job; do not fail a brand-new status.
  const nowMs = opts?.nowMs ?? Date.now();
  const graceMs = opts?.graceMs ?? QUEUED_ENQUEUE_GRACE_MS;
  try {
    const age = nowMs - fs.statSync(statusPath).mtimeMs;
    if (age < graceMs) return "noop";
  } catch {
    return "noop";
  }

  const prior = readStatusPrior(statusPath);
  writeJsonFile(statusPath, {
    ...pairingFieldsFromPrior(prior),
    runId,
    status: "failed",
    error: "orphaned queued status (job file missing)",
    errorCode: "orphan_queued",
  });
  return "failed";
}

/**
 * Full orphan heal for web/worker idle paths:
 * reclaim dead .running jobs first, then queued/active status cleanup.
 */
export function healAllOrphansFs(
  jobsDir: string,
  resultsDir: string,
  isPidAlive: (pid: number) => boolean,
): void {
  reclaimOrphanRunningJobsFs(jobsDir, resultsDir, isPidAlive);
  cleanupOrphanQueuedFs(jobsDir, resultsDir);
  cleanupOrphanRunningStatusFs(jobsDir, resultsDir);
}

/** Heal queued + running/cancel_requested orphans for one run. */
export function healRunOrphansFs(
  jobsDir: string,
  resultsDir: string,
  runId: string,
  isPidAlive: (pid: number) => boolean,
): void {
  // Reclaim may remove a dead .running.json that would otherwise block
  // healOrphanActiveStatusFs (hasJob → noop).
  reclaimOrphanRunningJobsFs(jobsDir, resultsDir, isPidAlive);
  healOrphanQueuedStatusFs(jobsDir, resultsDir, runId);
  healOrphanActiveStatusFs(jobsDir, resultsDir, runId);
}

/**
 * Fix status.json stuck at queued when no job file exists; remove stale .tmp.json.
 */
export function cleanupOrphanQueuedFs(
  jobsDir: string,
  resultsDir: string,
  opts?: { nowMs?: number; staleTmpMs?: number },
): { failedStatuses: string[]; removedTmp: string[] } {
  const failedStatuses: string[] = [];
  const removedTmp: string[] = [];
  const nowMs = opts?.nowMs ?? Date.now();
  const staleTmpMs = opts?.staleTmpMs ?? STALE_TMP_JOB_MS;
  fs.mkdirSync(jobsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".tmp.json")) continue;
    const p = path.join(jobsDir, name);
    try {
      const age = nowMs - fs.statSync(p).mtimeMs;
      if (age < staleTmpMs) continue;
      fs.unlinkSync(p);
      removedTmp.push(name);
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(resultsDir)) return { failedStatuses, removedTmp };

  for (const runId of fs.readdirSync(resultsDir)) {
    if (!/^run_[A-Za-z0-9._-]+$/.test(runId)) continue;
    if (healOrphanQueuedStatusFs(jobsDir, resultsDir, runId) === "failed") {
      failedStatuses.push(runId);
    }
  }

  return { failedStatuses, removedTmp };
}

/** Mid-run statuses that can get stuck without a backing job file. */
const ORPHAN_ACTIVE_STATUS = new Set([
  "running",
  "cancel_requested",
  // Wind-down written before result.json — heal if worker died mid-finish.
  "budget_stop",
]);

/**
 * Heal one run stuck at running/cancel_requested/budget_stop with no job file.
 * Returns synced | failed | noop.
 */
export function healOrphanActiveStatusFs(
  jobsDir: string,
  resultsDir: string,
  runId: string,
): "synced" | "failed" | "noop" {
  if (!/^run_[A-Za-z0-9._-]+$/.test(runId)) return "noop";
  const statusPath = path.join(resultsDir, runId, "status.json");
  if (!fs.existsSync(statusPath)) return "noop";

  let status = "unknown";
  try {
    const raw = JSON.parse(fs.readFileSync(statusPath, "utf8")) as {
      status?: string;
    };
    status = raw.status ?? "unknown";
  } catch {
    return "noop";
  }
  if (!ORPHAN_ACTIVE_STATUS.has(status)) return "noop";

  const hasJob =
    fs.existsSync(path.join(jobsDir, `${runId}.json`)) ||
    fs.existsSync(path.join(jobsDir, `${runId}.running.json`));
  if (hasJob) return "noop";

  const hasResult = fs.existsSync(path.join(resultsDir, runId, "result.json"));
  if (hasResult) {
    syncStatusFromResult(resultsDir, runId);
    return "synced";
  }

  // budget_stop without result and no job → treat as failed so Retry works.
  const errorCode =
    status === "budget_stop" ? "orphan_budget_stop" : "orphan_running";
  let prior: {
    role?: string;
    evaluationId?: string;
    costUsd?: number;
  } = {};
  try {
    prior = JSON.parse(fs.readFileSync(statusPath, "utf8")) as typeof prior;
  } catch {
    prior = {};
  }
  writeJsonFile(statusPath, {
    runId,
    status: "failed",
    error:
      status === "budget_stop"
        ? "Orphaned budget_stop (no result.json). Use Retry for a new run."
        : "Orphaned active status (no job file). Use Retry for a new run.",
    errorCode,
    ...(prior.role === "baseline" || prior.role === "candidate"
      ? { role: prior.role }
      : {}),
    ...(typeof prior.evaluationId === "string"
      ? { evaluationId: prior.evaluationId }
      : {}),
    ...(typeof prior.costUsd === "number" ? { costUsd: prior.costUsd } : {}),
  });
  return "failed";
}

/**
 * Heal status.json stuck at running/cancel_requested with no job file
 * (and optional result sync).
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
    const action = healOrphanActiveStatusFs(jobsDir, resultsDir, runId);
    if (action === "synced") synced.push(runId);
    else if (action === "failed") failedStatuses.push(runId);
  }

  return { synced, failedStatuses };
}
