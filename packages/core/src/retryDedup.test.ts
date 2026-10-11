import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findReusableRetryRunId,
  isRetryChildLive,
  releaseRetryEnqueueLock,
  saveRetryMarker,
  shouldReuseRetry,
  tryAcquireRetryEnqueueLock,
} from "./retryDedup.js";
import { writeJsonFile } from "./fsJson.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function loadStatus(root: string, id: string): string | undefined {
  const p = path.join(root, id, "status.json");
  if (!fs.existsSync(p)) return undefined;
  return (JSON.parse(fs.readFileSync(p, "utf8")) as { status?: string }).status;
}

function writeLiveWorker(jobs: string, pid = 42): void {
  writeJsonFile(path.join(jobs, ".worker"), {
    pid,
    at: new Date().toISOString(),
    busy: false,
  });
}

describe("tryAcquireRetryEnqueueLock", () => {
  it("allows only one holder; releases for the next", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-lock-"));
    temps.push(root);
    const from = "run_100_fromlock";
    fs.mkdirSync(path.join(root, from), { recursive: true });

    expect(tryAcquireRetryEnqueueLock(root, from)).toBe(true);
    expect(tryAcquireRetryEnqueueLock(root, from)).toBe(false);
    releaseRetryEnqueueLock(root, from);
    expect(tryAcquireRetryEnqueueLock(root, from)).toBe(true);
    releaseRetryEnqueueLock(root, from);
  });
});

describe("shouldReuseRetry", () => {
  it("reuses fresh queued child", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 1_000,
        nowMs: Date.now(),
        childStatus: "queued",
      }),
    ).toBe(true);
  });

  it("rejects expired marker", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 120_000,
        nowMs: Date.now(),
        childStatus: "queued",
      }),
    ).toBe(false);
  });

  it("rejects finished child", () => {
    expect(
      shouldReuseRetry({
        markerAtMs: Date.now() - 1_000,
        nowMs: Date.now(),
        childStatus: "failed",
      }),
    ).toBe(false);
  });
});

describe("isRetryChildLive", () => {
  it("requires a queued job file and a live worker heartbeat", () => {
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(jobs);
    const child = "run_100_childbbb";
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "queued",
        isPidAlive: () => true,
      }),
    ).toBe(false);

    fs.writeFileSync(path.join(jobs, `${child}.json`), "{}");
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "queued",
        isPidAlive: () => true,
      }),
    ).toBe(false);

    writeLiveWorker(jobs);
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "queued",
        isPidAlive: () => true,
      }),
    ).toBe(true);
  });

  it("rejects queued when worker PID is dead", () => {
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(jobs);
    const child = "run_100_childdead";
    fs.writeFileSync(path.join(jobs, `${child}.json`), "{}");
    writeLiveWorker(jobs, 99);
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "queued",
        isPidAlive: () => false,
      }),
    ).toBe(false);
  });

  it("rejects queued when heartbeat is stale", () => {
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(jobs);
    const child = "run_100_childstale";
    fs.writeFileSync(path.join(jobs, `${child}.json`), "{}");
    writeJsonFile(path.join(jobs, ".worker"), {
      pid: 42,
      at: new Date(Date.now() - 60_000).toISOString(),
      busy: false,
    });
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "queued",
        isPidAlive: () => true,
      }),
    ).toBe(false);
  });

  it("rejects running without live heartbeat ownership", () => {
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(jobs);
    const child = "run_100_childrun";
    fs.writeFileSync(path.join(jobs, `${child}.running.json`), "{}");
    fs.writeFileSync(
      path.join(jobs, `${child}.worker.pid`),
      JSON.stringify({ pid: 4242, runId: child }),
    );
    expect(
      isRetryChildLive({
        jobsDir: jobs,
        childRunId: child,
        childStatus: "cancel_requested",
        isPidAlive: () => true,
      }),
    ).toBe(false);
  });
});

describe("findReusableRetryRunId", () => {
  it("returns child run when marker is valid and job + worker are live", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(root, jobs);
    const from = "run_100_fromaaaa";
    const child = "run_100_childbbb";
    writeJsonFile(path.join(root, from, "status.json"), {
      runId: from,
      status: "failed",
    });
    saveRetryMarker(root, from, child);
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "queued",
    });
    fs.writeFileSync(path.join(jobs, `${child}.json`), "{}");
    writeLiveWorker(jobs);

    const reused = findReusableRetryRunId(
      root,
      from,
      (id) => loadStatus(root, id),
      { jobsDir: jobs, isPidAlive: () => true },
    );
    expect(reused).toBe(child);
  });

  it("returns null when queued child has no job file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(root, jobs);
    const from = "run_100_fromaaaa";
    const child = "run_100_childzzz";
    saveRetryMarker(root, from, child);
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "queued",
    });
    writeLiveWorker(jobs);

    expect(
      findReusableRetryRunId(root, from, (id) => loadStatus(root, id), {
        jobsDir: jobs,
        isPidAlive: () => true,
      }),
    ).toBeNull();
  });

  it("returns null when queued job exists but worker is dead", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(root, jobs);
    const from = "run_100_fromaaaa";
    const child = "run_100_childdeadw";
    saveRetryMarker(root, from, child);
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "queued",
    });
    fs.writeFileSync(path.join(jobs, `${child}.json`), "{}");
    writeLiveWorker(jobs);

    expect(
      findReusableRetryRunId(root, from, (id) => loadStatus(root, id), {
        jobsDir: jobs,
        isPidAlive: () => false,
      }),
    ).toBeNull();
  });

  it("returns null when running child heartbeat does not own the run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    const jobs = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-jobs-"));
    temps.push(root, jobs);
    const from = "run_100_fromaaaa";
    const child = "run_100_childrun";
    saveRetryMarker(root, from, child);
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "cancel_requested",
    });
    fs.writeFileSync(path.join(jobs, `${child}.running.json`), "{}");
    fs.writeFileSync(
      path.join(jobs, `${child}.worker.pid`),
      JSON.stringify({ pid: 99, runId: child }),
    );
    writeJsonFile(path.join(jobs, ".worker"), {
      pid: 99,
      at: new Date().toISOString(),
      busy: true,
      runId: "run_100_someoneelse",
    });

    expect(
      findReusableRetryRunId(root, from, (id) => loadStatus(root, id), {
        jobsDir: jobs,
        isPidAlive: () => true,
      }),
    ).toBeNull();
  });
});
