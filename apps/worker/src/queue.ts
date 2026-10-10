import fs from "node:fs";
import path from "node:path";
import { JobManifestSchema, type JobManifest } from "@skillevalator/core";
import { config } from "./config.js";
import { runJob } from "./runJob.js";

function ensureDirs() {
  fs.mkdirSync(config.jobsDir, { recursive: true });
  fs.mkdirSync(config.resultsDir, { recursive: true });
}

function listQueued(): string[] {
  return fs
    .readdirSync(config.jobsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".running.json"))
    .map((f) => path.join(config.jobsDir, f))
    .sort();
}

function claim(jobPath: string): JobManifest | null {
  const running = jobPath.replace(/\.json$/, ".running.json");
  try {
    fs.renameSync(jobPath, running);
  } catch {
    return null;
  }
  try {
    const text = fs.readFileSync(running, "utf8").replace(/^\uFEFF/, "");
    const raw = JSON.parse(text);
    return JobManifestSchema.parse(raw);
  } catch (e) {
    fs.renameSync(running, jobPath.replace(/\.json$/, ".failed.json"));
    console.error("invalid job", e);
    return null;
  }
}

export async function pollOnce(): Promise<boolean> {
  ensureDirs();
  const lock = path.join(config.jobsDir, ".lock");
  if (fs.existsSync(lock)) {
    const age = Date.now() - fs.statSync(lock).mtimeMs;
    if (age < 30 * 60 * 1000) return false;
    fs.unlinkSync(lock);
  }

  const queued = listQueued();
  if (queued.length === 0) return false;
  const jobPath = queued[0]!;
  const job = claim(jobPath);
  if (!job) return false;

  const running = jobPath.replace(/\.json$/, ".running.json");
  fs.writeFileSync(lock, String(process.pid), "utf8");
  try {
    console.log("running", job.runId);
    await runJob(job);
    fs.renameSync(running, jobPath.replace(/\.json$/, ".done.json"));
  } catch (e) {
    console.error(e);
    try {
      fs.renameSync(running, jobPath.replace(/\.json$/, ".failed.json"));
    } catch {
      /* ignore */
    }
  } finally {
    try {
      fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
  return true;
}

export async function loop() {
  ensureDirs();
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
