import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupOrphanQueuedFs,
  cleanupOrphanRunningStatusFs,
  decideOrphanRunningAction,
  formatWorkerPidRecord,
  healAllOrphansFs,
  healOrphanQueuedStatusFs,
  healRunOrphansFs,
  heartbeatOwnsRunFs,
  parseWorkerPidRecord,
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

const sampleResult = (runId: string) => ({
  runId,
  evalSkillId: "code-debugging-eval",
  evalSkillVersion: "abc",
  evalSkillGithubUrl:
    "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
  taskSetId: "cde-v1",
  taskIds: ["bug-01"],
  pipeline: { produce: "model", grade: "docker_script" },
  modelId: "gpt-4o-mini",
  decoding: { temperature: 0, top_p: 1 },
  repeats: 1,
  aggregate: "mean",
  perTask: [
    {
      taskId: "bug-01",
      scriptResults: [],
      score: 1,
      status: "ok",
    },
  ],
  score: 1,
  subscores: {},
  rationale: "",
  findings: [],
  costUsd: 0.01,
  latencyMs: 100,
  status: "ok",
  startedAt: "2026-01-01T00:00:00.000Z",
  mode: "dry-run",
});

describe("decideOrphanRunningAction", () => {
  it("skips only when pid alive and heartbeat owns run", () => {
    expect(
      decideOrphanRunningAction({
        pidAlive: true,
        hasResult: false,
        heartbeatOwnsRun: true,
      }),
    ).toBe("skip_alive");
  });

  it("does not skip on pid reuse without heartbeat ownership", () => {
    expect(
      decideOrphanRunningAction({
        pidAlive: true,
        hasResult: false,
        heartbeatOwnsRun: false,
      }),
    ).toBe("fail_orphan");
  });

  it("finalizes when result exists", () => {
    expect(
      decideOrphanRunningAction({
        pidAlive: false,
        hasResult: true,
        heartbeatOwnsRun: false,
      }),
    ).toBe("finalize_done");
  });

  it("fails incomplete orphans instead of requeue", () => {
    expect(
      decideOrphanRunningAction({
        pidAlive: null,
        hasResult: false,
        heartbeatOwnsRun: false,
      }),
    ).toBe("fail_orphan");
  });

  it("skips during claim grace when pid is alive", () => {
    expect(
      decideOrphanRunningAction({
        pidAlive: true,
        hasResult: false,
        heartbeatOwnsRun: false,
        withinClaimGrace: true,
      }),
    ).toBe("skip_alive");
  });
});

describe("parseWorkerPidRecord", () => {
  it("parses plain pid and json", () => {
    expect(parseWorkerPidRecord("42")).toEqual({ pid: 42 });
    expect(
      parseWorkerPidRecord(
        formatWorkerPidRecord({ pid: 7, runId: "run_100_x" }),
      ),
    ).toMatchObject({ pid: 7, runId: "run_100_x" });
  });
});

describe("heartbeatOwnsRunFs", () => {
  it("requires matching pid and runId on fresh heartbeat", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    fs.mkdirSync(jobsDir, { recursive: true });
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 99,
      at: new Date().toISOString(),
      busy: true,
      runId: "run_100_own",
    });
    expect(heartbeatOwnsRunFs(jobsDir, "run_100_own", 99)).toBe(true);
    expect(heartbeatOwnsRunFs(jobsDir, "run_100_other", 99)).toBe(false);
    expect(heartbeatOwnsRunFs(jobsDir, "run_100_own", 100)).toBe(false);
  });

  it("does not own a run when heartbeat has no runId", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    fs.mkdirSync(jobsDir, { recursive: true });
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 99,
      at: new Date().toISOString(),
      busy: false,
    });
    expect(heartbeatOwnsRunFs(jobsDir, "run_100_zombie", 99)).toBe(false);
  });
});

describe("reclaimOrphanRunningJobsFs", () => {
  it("finalizes completed orphan and syncs status from result", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_abcd1234";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });
    writeJsonFile(path.join(resultsDir, runId, "result.json"), sampleResult(runId));

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => false);
    expect(out.finalized).toEqual([`${runId}.running.json`]);
    expect(out.failed).toEqual([]);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.done.json`))).toBe(true);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("ok");
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
    expect(fs.existsSync(path.join(jobsDir, `${runId}.json`))).toBe(false);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { errorCode?: string };
    expect(status.errorCode).toBe("orphan_running");
  });

  it("skips when pid alive and heartbeat owns the run", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_alivepid";
    const running = path.join(jobsDir, `${runId}.running.json`);
    fs.writeFileSync(running, "{}");
    fs.writeFileSync(
      path.join(jobsDir, `${runId}.worker.pid`),
      formatWorkerPidRecord({ pid: 12345, runId }),
    );
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 12345,
      at: new Date().toISOString(),
      busy: true,
      runId,
    });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => true);
    expect(out.finalized).toEqual([]);
    expect(out.failed).toEqual([]);
    expect(fs.existsSync(running)).toBe(true);
  });

  it("fails zombie .running when pid alive but idle heartbeat has no runId", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_idlehb";
    const running = path.join(jobsDir, `${runId}.running.json`);
    fs.writeFileSync(running, "{}");
    fs.writeFileSync(
      path.join(jobsDir, `${runId}.worker.pid`),
      formatWorkerPidRecord({ pid: 12345, runId }),
    );
    // Backdate past claim grace so reclaim may fail the orphan.
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(running, past, past);
    fs.utimesSync(path.join(jobsDir, `${runId}.worker.pid`), past, past);
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 12345,
      at: new Date().toISOString(),
      busy: false,
    });
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => true);
    expect(out.failed).toEqual([`${runId}.running.json`]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { errorCode?: string };
    expect(status.errorCode).toBe("orphan_running");
  });

  it("skips fresh claim before heartbeat has runId", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_claimgrace";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    fs.writeFileSync(
      path.join(jobsDir, `${runId}.worker.pid`),
      formatWorkerPidRecord({ pid: 55, runId }),
    );
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 55,
      at: new Date().toISOString(),
      busy: false,
    });
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => true);
    expect(out.failed).toEqual([]);
    expect(out.finalized).toEqual([]);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.running.json`))).toBe(
      true,
    );
  });

  it("fails when pid is alive but heartbeat is for another process (PID reuse)", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_pidreuse";
    const running = path.join(jobsDir, `${runId}.running.json`);
    const pidFile = path.join(jobsDir, `${runId}.worker.pid`);
    fs.writeFileSync(running, "{}");
    fs.writeFileSync(pidFile, "12345");
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(running, past, past);
    fs.utimesSync(pidFile, past, past);
    writeJsonFile(path.join(jobsDir, ".worker"), {
      pid: 99999,
      at: new Date().toISOString(),
      busy: true,
      runId: "run_100_other",
    });
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    const out = reclaimOrphanRunningJobsFs(jobsDir, resultsDir, () => true);
    expect(out.failed).toEqual([`${runId}.running.json`]);
    expect(fs.existsSync(path.join(jobsDir, `${runId}.failed.json`))).toBe(
      true,
    );
  });
});

describe("cleanupOrphanQueuedFs", () => {
  it("marks queued status failed when job file missing", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_orphanq";
    const statusPath = path.join(resultsDir, runId, "status.json");
    writeJsonFile(statusPath, {
      runId,
      status: "queued",
    });
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(statusPath, past, past);

    const out = cleanupOrphanQueuedFs(jobsDir, resultsDir);
    expect(out.failedStatuses).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(statusPath, "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_queued");
  });

  it("removes only aged tmp job files", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const fresh = path.join(jobsDir, "run_100_tmpfresh.tmp.json");
    const old = path.join(jobsDir, "run_100_tmpx.tmp.json");
    fs.writeFileSync(fresh, "{}");
    fs.writeFileSync(old, "{}");
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(old, past, past);

    const out = cleanupOrphanQueuedFs(jobsDir, resultsDir);
    expect(out.removedTmp).toEqual(["run_100_tmpx.tmp.json"]);
    expect(fs.existsSync(fresh)).toBe(true);
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
  });
});

describe("healAllOrphansFs / healRunOrphansFs", () => {
  it("reclaims dead .running.json so active status can fail", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_webreclaim";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    fs.writeFileSync(
      path.join(jobsDir, `${runId}.worker.pid`),
      formatWorkerPidRecord({ pid: 4242, runId }),
    );
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    healAllOrphansFs(jobsDir, resultsDir, () => false);

    expect(fs.existsSync(path.join(jobsDir, `${runId}.running.json`))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(jobsDir, `${runId}.failed.json`))).toBe(
      true,
    );
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_running");
  });

  it("healRunOrphansFs reclaims before per-run active heal", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_runreclaim";
    fs.writeFileSync(path.join(jobsDir, `${runId}.running.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "cancel_requested",
    });

    healRunOrphansFs(jobsDir, resultsDir, runId, () => false);

    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_running");
  });
});

describe("healOrphanQueuedStatusFs", () => {
  it("fails a single orphan queued run", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_singleq";
    const statusPath = path.join(resultsDir, runId, "status.json");
    writeJsonFile(statusPath, {
      runId,
      status: "queued",
    });
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(statusPath, past, past);

    expect(healOrphanQueuedStatusFs(jobsDir, resultsDir, runId)).toBe(
      "failed",
    );
    const status = JSON.parse(
      fs.readFileSync(statusPath, "utf8"),
    ) as { errorCode?: string };
    expect(status.errorCode).toBe("orphan_queued");
  });

  it("is noop during enqueue grace when job file is not yet written", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_freshq";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "queued",
    });

    expect(healOrphanQueuedStatusFs(jobsDir, resultsDir, runId)).toBe("noop");
  });

  it("is noop when queued job file exists", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_liveq";
    fs.writeFileSync(path.join(jobsDir, `${runId}.json`), "{}");
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "queued",
    });

    expect(healOrphanQueuedStatusFs(jobsDir, resultsDir, runId)).toBe("noop");
  });
});

describe("cleanupOrphanRunningStatusFs", () => {
  it("fails running status with no job file", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_stuckrun";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });

    const out = cleanupOrphanRunningStatusFs(jobsDir, resultsDir);
    expect(out.failedStatuses).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { errorCode?: string };
    expect(status.errorCode).toBe("orphan_running");
  });

  it("syncs running status when result exists without job", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_resultrun";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "running",
    });
    writeJsonFile(path.join(resultsDir, runId, "result.json"), sampleResult(runId));

    const out = cleanupOrphanRunningStatusFs(jobsDir, resultsDir);
    expect(out.synced).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("ok");
  });

  it("fails orphan cancel_requested with no job file", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_stuckcancel";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "cancel_requested",
    });

    const out = cleanupOrphanRunningStatusFs(jobsDir, resultsDir);
    expect(out.failedStatuses).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string; errorCode?: string };
    expect(status.status).toBe("failed");
    expect(status.errorCode).toBe("orphan_running");
  });

  it("syncs cancel_requested when cancelled result exists without job", () => {
    const root = tmpRoot();
    const jobsDir = path.join(root, "jobs");
    const resultsDir = path.join(root, "results");
    fs.mkdirSync(jobsDir, { recursive: true });
    const runId = "run_100_cancelresult";
    writeJsonFile(path.join(resultsDir, runId, "status.json"), {
      runId,
      status: "cancel_requested",
    });
    writeJsonFile(path.join(resultsDir, runId, "result.json"), {
      ...sampleResult(runId),
      score: null,
      status: "cancelled",
      findings: ["cancelled"],
      perTask: [
        {
          taskId: "bug-01",
          scriptResults: [],
          score: null,
          status: "cancelled",
        },
      ],
    });

    const out = cleanupOrphanRunningStatusFs(jobsDir, resultsDir);
    expect(out.synced).toEqual([runId]);
    const status = JSON.parse(
      fs.readFileSync(path.join(resultsDir, runId, "status.json"), "utf8"),
    ) as { status: string };
    expect(status.status).toBe("cancelled");
  });
});
