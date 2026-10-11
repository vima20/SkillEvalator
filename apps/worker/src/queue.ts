import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  type JobManifest,
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

/**
 * Re-queue .running jobs only when their worker PID is missing or dead.
 * Avoids stealing a live official run from another (or same) worker.
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
    if (runId) markStatusFailed(runId);
    console.error("invalid job", e);
    return null;
  }
}

function markStatusFailed(runId: string) {
  try {
    writeJsonFile(path.join(config.resultsDir, runId, "status.json"), {
      runId,
      status: "failed",
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
    try {
      fs.renameSync(running, jobPath.replace(/\.json$/, ".done.json"));
    } catch (e) {
      // Job may have been reclaimed; keep result if already written.
      const resultPath = path.join(config.resultsDir, job.runId, "result.json");
      if (!fs.existsSync(resultPath)) {
        markStatusFailed(job.runId);
        throw e;
      }
      console.warn("could not rename to .done (result present)", job.runId, e);
    }
  } catch (e) {
    console.error(e);
    markStatusFailed(job.runId);
    try {
      fs.renameSync(running, jobPath.replace(/\.json$/, ".failed.json"));
    } catch {
      /* ignore */
    }
  } finally {
    try {
      fs.unlinkSync(workerPidPath(running));
    } catch {
      /* ignore */
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
