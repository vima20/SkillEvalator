import fs from "node:fs";
import path from "node:path";
import { writeJsonFile } from "./fsJson.js";

export type OrphanRunningAction = "skip_alive" | "finalize_done" | "requeue";

/** Pure decision helper for orphan .running jobs (unit-tested). */
export function decideOrphanRunningAction(opts: {
  pidAlive: boolean | null;
  hasResult: boolean;
}): OrphanRunningAction {
  if (opts.pidAlive === true) return "skip_alive";
  if (opts.hasResult) return "finalize_done";
  return "requeue";
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

/**
 * Reclaim .running jobs when worker PID is dead/missing.
 * Never re-queue when result.json already exists.
 */
export function reclaimOrphanRunningJobsFs(
  jobsDir: string,
  resultsDir: string,
  isPidAlive: (pid: number) => boolean,
): { finalized: string[]; requeued: string[] } {
  const finalized: string[] = [];
  const requeued: string[] = [];
  if (!fs.existsSync(jobsDir)) return { finalized, requeued };

  for (const name of fs.readdirSync(jobsDir)) {
    if (!name.endsWith(".running.json")) continue;
    const running = path.join(jobsDir, name);
    const pidFile = workerPidPath(running);
    let pidAlive: boolean | null = null;
    if (fs.existsSync(pidFile)) {
      try {
        const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
        pidAlive = isPidAlive(pid);
      } catch {
        pidAlive = false;
      }
    } else {
      pidAlive = false;
    }

    const runId = runIdFromJobPath(running);
    const hasResult = Boolean(
      runId && fs.existsSync(path.join(resultsDir, runId, "result.json")),
    );
    const action = decideOrphanRunningAction({ pidAlive, hasResult });
    if (action === "skip_alive") continue;
    if (action === "finalize_done") {
      finalizeRunningJob(running, "done");
      finalized.push(name);
      continue;
    }
    const queued = running.replace(/\.running\.json$/, ".json");
    try {
      fs.renameSync(running, queued);
      try {
        fs.unlinkSync(pidFile);
      } catch {
        /* ignore */
      }
      requeued.push(name);
    } catch {
      /* ignore */
    }
  }
  return { finalized, requeued };
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
