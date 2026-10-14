import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RETRY_CHAIN_MAX_HOPS,
  RETRY_DEDUP_WINDOW_MS,
  clearRetryMarker,
  findReusableRetryRunId,
  isRetryChildLive,
  loadRetryMarker,
  releaseRetryEnqueueLock,
  resolveLegRunIdViaRetryChain,
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

  it("steals a stale lock via unlink+wx", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-stale-"));
    temps.push(root);
    const from = "run_100_stale";
    const lock = path.join(root, from, "retry-enqueue.lock");
    fs.mkdirSync(path.join(root, from), { recursive: true });
    fs.writeFileSync(lock, "1", "utf8");
    const past = new Date(Date.now() - RETRY_DEDUP_WINDOW_MS - 1_000);
    fs.utimesSync(lock, past, past);
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
  it("clearRetryMarker drops retry-of.json so reuse cannot find the child", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-retry-"));
    temps.push(root);
    const from = "run_100_fromaaaa";
    const child = "run_100_childclr";
    writeJsonFile(path.join(root, from, "status.json"), {
      runId: from,
      status: "failed",
    });
    saveRetryMarker(root, from, child);
    expect(loadRetryMarker(root, from)?.runId).toBe(child);
    clearRetryMarker(root, from);
    expect(loadRetryMarker(root, from)).toBeNull();
    clearRetryMarker(root, from); // idempotent
  });

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

describe("resolveLegRunIdViaRetryChain", () => {
  it("follows retry-of to the newest same-eval same-role child", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-chain-"));
    temps.push(root);
    const evaluationId = "eval_100_chainxx";
    const oldId = "run_100_oldlegxx";
    const midId = "run_100_midlegxx";
    const newId = "run_100_newlegxx";

    writeJsonFile(path.join(root, oldId, "status.json"), {
      runId: oldId,
      status: "failed",
      role: "candidate",
      evaluationId,
    });
    writeJsonFile(path.join(root, midId, "status.json"), {
      runId: midId,
      status: "failed",
      role: "candidate",
      evaluationId,
    });
    writeJsonFile(path.join(root, newId, "status.json"), {
      runId: newId,
      status: "ok",
      role: "candidate",
      evaluationId,
    });
    saveRetryMarker(root, oldId, midId);
    saveRetryMarker(root, midId, newId);

    const out = resolveLegRunIdViaRetryChain({
      resultsDir: root,
      fromRunId: oldId,
      evaluationId,
      role: "candidate",
      loadLeg: (id) => {
        const p = path.join(root, id, "status.json");
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, "utf8")) as {
          evaluationId?: string;
          role?: string;
          status?: string;
        };
      },
    });
    expect(out.runId).toBe(newId);
    expect(out.hops).toBe(2);
  });

  it("refuses to follow a child with a different evaluationId or role", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-chain-bad-"));
    temps.push(root);
    const from = "run_100_fromlegx";
    const child = "run_100_badchild";
    writeJsonFile(path.join(root, from, "status.json"), {
      runId: from,
      status: "failed",
      role: "baseline",
      evaluationId: "eval_100_a",
    });
    writeJsonFile(path.join(root, child, "status.json"), {
      runId: child,
      status: "ok",
      role: "candidate",
      evaluationId: "eval_100_a",
    });
    saveRetryMarker(root, from, child);

    const out = resolveLegRunIdViaRetryChain({
      resultsDir: root,
      fromRunId: from,
      evaluationId: "eval_100_a",
      role: "baseline",
      loadLeg: (id) => {
        const p = path.join(root, id, "status.json");
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, "utf8")) as {
          evaluationId?: string;
          role?: string;
        };
      },
    });
    expect(out.runId).toBe(from);
    expect(out.hops).toBe(0);
  });

  it("stops on cycles without hanging", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-chain-cyc-"));
    temps.push(root);
    const a = "run_100_cycleaaa";
    const b = "run_100_cyclebbb";
    const evaluationId = "eval_100_cycle";
    for (const id of [a, b]) {
      writeJsonFile(path.join(root, id, "status.json"), {
        runId: id,
        status: "failed",
        role: "candidate",
        evaluationId,
      });
    }
    saveRetryMarker(root, a, b);
    saveRetryMarker(root, b, a);

    const out = resolveLegRunIdViaRetryChain({
      resultsDir: root,
      fromRunId: a,
      evaluationId,
      role: "candidate",
      maxHops: RETRY_CHAIN_MAX_HOPS,
      loadLeg: (id) => {
        const p = path.join(root, id, "status.json");
        return JSON.parse(fs.readFileSync(p, "utf8")) as {
          evaluationId?: string;
          role?: string;
        };
      },
    });
    expect(out.runId).toBe(b);
    expect(out.hops).toBe(1);
  });
});
