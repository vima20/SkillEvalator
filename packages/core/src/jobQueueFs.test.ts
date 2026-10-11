import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOrphanQueuedFs,
  decideOrphanRunningAction,
  reclaimOrphanRunningJobsFs,
} from "./jobQueueFs.js";
import { writeJsonFile } from "./fsJson.js";

const temps: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "se-qfs-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("decideOrphanRunningAction", () => {
  it("skips live pid", () => {
    expect(
      decideOrphanRunningAction({ pidAlive: true, hasResult: false }),
    ).toBe("skip_alive");
  });
  it("finalizes when result exists", () => {
    expect(
      decideOrphanRunningAction({ pidAlive: false, hasResult: true }),
    ).toBe("finalize_done");
  });
  it("fails incomplete orphans instead of requeue", () => {
    expect(
      decideOrphanRunningAction({ pidAlive: null, hasResult: false }),
    ).toBe("fail_orphan");
  });
});

describe("reclaimOrphanRunningJobsFs", () => {
  it("finalizes completed orphan instead of requeue", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_abcd1234";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "result.json"), { ok: true });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => false);
    expect(out.finalized).toEqual([`${runId}.running.json`]);
    expect(out.failed).toEqual([]);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.done.json`))).toBe(true);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.json`))).toBe(false);
  });

  it("fails incomplete orphan without requeue", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_deadbeef";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => false);
    expect(out.failed).toEqual([`${runId}.running.json`]);
    expect(out.finalized).toEqual([]);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.failed.json`))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(jobsDir, `${runId}.json`))).toBe(false);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_running");
  });

  it("skips alive worker pid", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_alivepid";
    const running = path.join(jobsDir, `${runId}.running.json`);
    fs.writeFileSync(running, "{}");
    fs.writeFileSync(path.join(jobsDir, `${runId}.worker.pid`), "12345");

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => true);
    expect(out.finalized).toEqual([]);
    expect(out.failed).toEqual([]);
    expect(fs.existsSync(running)).toBe(true);
  });
});

describe("cleanupOrphanQueuedFs", () => {
  it("marks queued status failed when job file missing", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_orphanq";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "queued",
    });

    const out = cleanupOrphanQueuedFs(jobsDir, resultsDir);
    expect(out.failedStatuses).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_queued");
  });

  it("removes stale tmp job files", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    fs.writeFileSync(path.join(jobsDir, "run_100_tmpx.tmp.json"), "{}");

    const out = cleanupOrphanQueuedFs(jobsDir, resultsDir);
    expect(out.removedTmp).toEqual(["run_100_tmpx.tmp.json"]);
    expect(fs.existsSync(path.join(jobsDir, "run_100_tmpx.tmp.json"))).toBe(
      false,
    );
  });

  it("leaves legitimate queued jobs alone", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_legitq";
    fs.writeFileSync(path.join(jobsDir, `${runId}.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "queued",
    });

    const out = cleanupOrphanQueuedFs(jobsDir, resultsDir);
    expect(out.failedStatuses).toEqual([]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("queued");
  });
});
