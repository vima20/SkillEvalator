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

const LOCK_STALE_MS = 30 * 60 * 1000;

function ensureDirs() {
  fs.mkdirSync(config.jobsDir, { recursive: true });
  fs.mkdirSync(config.resultsDir, { recursive: true });
}

function listQueued(): string[] {
  return fs
    .readdirSync(config.jobsDir)
    .filter(isQueuedJobFile)
    .map((f) => path.join(config.jobsDir, f))
    .sort();
}

/** Acquire jobsDir lock with atomic create before claiming a job. */
function tryAcquireLock(lockPath: string): boolean {
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age >= LOCK_STALE_MS) {
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
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/** Re-queue jobs left as .running.json after a crash. */
export function reclaimOrphanRunningJobs(): void {
  ensureDirs();
  for (const name of fs.readdirSync(config.jobsDir)) {
    if (!name.endsWith(".running.json")) continue;
    const running = path.join(config.jobsDir, name);
    const queued = running.replace(/\.running\.json$/, ".json");
    try {
      fs.renameSync(running, queued);
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

  try {
    const queued = listQueued();
    if (queued.length === 0) return false;
    const jobPath = queued[0]!;
    const job = claim(jobPath);
    if (!job) return false;

    const running = jobPath.replace(/\.json$/, ".running.json");
    try {
      console.log("running", job.runId);
      await runJob(job);
      fs.renameSync(running, jobPath.replace(/\.json$/, ".done.json"));
    } catch (e) {
      console.error(e);
      markStatusFailed(job.runId);
      try {
        fs.renameSync(running, jobPath.replace(/\.json$/, ".failed.json"));
      } catch {
        /* ignore */
      }
    }
    return true;
  } finally {
    releaseLock(lock);
  }
}

export async function loop() {
  ensureDirs();
  reclaimOrphanRunningJobs();
  console.log("worker watching", config.jobsDir);
  console.log("skills", config.skillsDir);
  for (;;) {
    try {
      const did = await pollOnce();
      if (!did) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error("poll error", e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
