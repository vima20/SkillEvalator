import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  type JobManifest,
  formatRunError,
  isQueuedJobFile,
  readJsonFileAs,
  writeJsonFile,
} from "@skillevalator/core";
import { config } from "./config.js";
import { runJob } from "./runJob.js";

function ensureDirs() {
  fs.mkdirSync(config.jobsDir, { recursive: true });
  fs.mkdirSync(config.resultsDir, { recursive: true });
}

/** Soft liveness signal for web preflight (pid + timestamp). */
function touchHeartbeat(): void {
  try {
    writeJsonFile(path.join(config.jobsDir, ".worker"), {
      pid: process.pid,
      at: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

function listQueued(): string[] {
  return fs
    .readdirSync(config.jobsDir)
    .filter(isQueuedJobFile)
    .map((f) => path.join(config.jobsDir, f))
    .sort();
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
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
    .replace(/\.json$/, "");
  return /^run_[A-Za-z0-9._-]+$/.test(base) ? base : null;
}

/** Acquire claim lock; steal only if recorded PID is dead (not by age). */
function tryAcquireLock(lockPath: string): boolean {
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const pid = Number(fs.readFileSync(lockPath, "utf8").trim());
      if (!isPidAlive(pid)) {
        fs.unlinkSync(lockPath);
        fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }
}

function releaseLock(lockPath: string) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    if (Number(raw) === process.pid) fs.unlinkSync(lockPath);
  } catch {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

/** Clear leftover lock from a crashed previous process of this host. */
function clearDeadLock(): void {
  const lock = path.join(config.jobsDir, ".lock");
  if (!fs.existsSync(lock)) return;
  try {
    const pid = Number(fs.readFileSync(lock, "utf8").trim());
    if (!isPidAlive(pid)) {
      fs.unlinkSync(lock);
      console.warn("cleared dead queue lock from pid", pid);
    }
  } catch {
    /* ignore */
  }
}

function resultJsonPath(runId: string): string {
  return path.join(config.resultsDir, runId, "result.json");
}

/** Move .running → .done/.failed; drop pid file. Never leave a completed job as .running. */
function finalizeRunningJob(
  runningPath: string,
  outcome: "done" | "failed",
): void {
  const target = runningPath.replace(/\.running\.json$/, `.${outcome}.json`);
  const pidFile = workerPidPath(runningPath);
  try {
    if (fs.existsSync(runningPath)) {
      if (fs.existsSync(target)) {
        fs.unlinkSync(runningPath);
      } else {
        fs.renameSync(runningPath, target);
      }
    }
  } catch (e) {
    console.error("finalize job file failed", runningPath, outcome, e);
  }
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

/**
 * Reclaim .running jobs only when their worker PID is missing or dead.
 * If result.json already exists, finalize as .done (never re-queue — avoids double spend).
 */
export function reclaimOrphanRunningJobs(): void {
  ensureDirs();
  for (const name of fs.readdirSync(config.jobsDir)) {
    if (!name.endsWith(".running.json")) continue;
    const running = path.join(config.jobsDir, name);
    const pidFile = workerPidPath(running);
    if (fs.existsSync(pidFile)) {
      try {
        const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
        if (isPidAlive(pid)) continue;
      } catch {
        /* treat as orphan */
      }
    }

    const runId = runIdFromJobPath(running);
    if (runId && fs.existsSync(resultJsonPath(runId))) {
      finalizeRunningJob(running, "done");
      console.warn("finalized orphan completed job (result present)", name);
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
      console.warn("requeued orphan", name);
    } catch (e) {
      console.error("failed to reclaim", name, e);
    }
  }
}

function claim(jobPath: string): JobManifest | null {
  const running = jobPath.replace(/\.json$/, ".running.json");
  try {
    fs.renameSync(jobPath, running);
  } catch {
    return null;
  }
  try {
    return readJsonFileAs(JobManifestSchema, running);
  } catch (e) {
    fs.renameSync(running, jobPath.replace(/\.json$/, ".failed.json"));
    const runId = runIdFromJobPath(jobPath);
    if (runId) markStatusFailed(runId, e);
    console.error("invalid job", e);
    return null;
  }
}

function markStatusFailed(runId: string, err?: unknown) {
  try {
    const formatted = err !== undefined ? formatRunError(err) : undefined;
    writeJsonFile(path.join(config.resultsDir, runId, "status.json"), {
      runId,
      status: "failed",
      ...(formatted?.error ? { error: formatted.error } : {}),
      ...(formatted?.errorCode ? { errorCode: formatted.errorCode } : {}),
    });
  } catch {
    /* ignore */
  }
}

export async function pollOnce(): Promise<boolean> {
  ensureDirs();
  const lock = path.join(config.jobsDir, ".lock");
  if (!tryAcquireLock(lock)) return false;

  let job: JobManifest | null = null;
  let jobPath = "";
  let running = "";

  try {
    const queued = listQueued();
    if (queued.length === 0) return false;
    jobPath = queued[0]!;
    job = claim(jobPath);
    if (!job) return false;
    running = jobPath.replace(/\.json$/, ".running.json");
    fs.writeFileSync(workerPidPath(running), String(process.pid), "utf8");
  } finally {
    // Release before produce/grade so long official runs cannot stale-steal the lock.
    releaseLock(lock);
  }

  if (!job) return false;

  try {
    console.log("running", job.runId);
    await runJob(job);
    finalizeRunningJob(running, "done");
  } catch (e) {
    console.error(e);
    markStatusFailed(job.runId, e);
    if (fs.existsSync(resultJsonPath(job.runId))) {
      // Result written then later step failed — do not re-run produce.
      finalizeRunningJob(running, "done");
    } else {
      finalizeRunningJob(running, "failed");
    }
  }
  return true;
}

export async function loop() {
  ensureDirs();
  clearDeadLock();
  reclaimOrphanRunningJobs();
  touchHeartbeat();
  console.log("worker watching", config.jobsDir);
  console.log("skills", config.skillsDir);
  for (;;) {
    try {
      touchHeartbeat();
      const did = await pollOnce();
      if (!did) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error("poll error", e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
