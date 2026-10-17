import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "@skillevalator/core";

const temps: string[] = [];
let jobsRoot = "";
let resultsRoot = "";

vi.mock("@/lib/paths", () => ({
  jobsDir: () => jobsRoot,
  resultsDir: () => resultsRoot,
  skillsDirs: () => [],
  skillsDir: () => "",
  importedSkillsDir: () => path.join(resultsRoot, "imported"),
  repoRoot: () => resultsRoot,
}));

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  vi.resetModules();
});

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-job-eval-"));
  temps.push(root);
  jobsRoot = path.join(root, "jobs");
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(jobsRoot, { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
});

function writeLiveJob(
  fileName: string,
  runId: string,
  evaluationId: string,
): void {
  writeJsonFile(path.join(jobsRoot, fileName), {
    runId,
    evalSkillId: "skill_demo",
    mode: "dry-run",
    repeats: 1,
    role: "candidate",
    evaluationId,
    createdAt: new Date().toISOString(),
  });
}

describe("loadJobEvaluationId", () => {
  it("reads evaluationId from live queued .json", async () => {
    const { loadJobEvaluationId } = await import(
      "./runDetailEvaluationPack.js"
    );
    const runId = "run_live_q1";
    writeLiveJob(`${runId}.json`, runId, "eval_live_q1");
    expect(loadJobEvaluationId(runId)).toBe("eval_live_q1");
  });

  it("reads evaluationId from .running.json", async () => {
    const { loadJobEvaluationId } = await import(
      "./runDetailEvaluationPack.js"
    );
    const runId = "run_live_r1";
    writeLiveJob(`${runId}.running.json`, runId, "eval_live_r1");
    expect(loadJobEvaluationId(runId)).toBe("eval_live_r1");
  });

  it("prefers failed over live .json", async () => {
    const { loadJobEvaluationId } = await import(
      "./runDetailEvaluationPack.js"
    );
    const runId = "run_live_pref";
    writeLiveJob(`${runId}.failed.json`, runId, "eval_failed");
    writeLiveJob(`${runId}.json`, runId, "eval_live");
    expect(loadJobEvaluationId(runId)).toBe("eval_failed");
  });
});

describe("resolveRunDetailEvaluationId from live job disk", () => {
  it("uses live .json when status and result lack evaluationId", async () => {
    const { resolveRunDetailEvaluationId } = await import(
      "./runDetailEvaluationPack.js"
    );
    const runId = "run_live_res";
    writeLiveJob(`${runId}.json`, runId, "eval_from_live");
    expect(
      resolveRunDetailEvaluationId({
        runId,
        status: {},
        result: null,
      }),
    ).toBe("eval_from_live");
  });
});

describe("resolveRetryEvaluationId terminal scan", () => {
  it("skips failed.json without evaluationId and uses done.json", async () => {
    const {
      loadTerminalJobEvaluationId,
      resolveRetryEvaluationId,
      resolveRunDetailEvaluationId,
    } = await import("./runDetailEvaluationPack.js");
    const runId = "run_retry_scan";
    writeJsonFile(path.join(jobsRoot, `${runId}.failed.json`), {
      runId,
      evalSkillId: "skill_demo",
      mode: "official",
      repeats: 1,
      role: "candidate",
      // intentionally no evaluationId
      createdAt: new Date().toISOString(),
    });
    writeLiveJob(`${runId}.done.json`, runId, "eval_from_done");
    writeLiveJob(`${runId}.json`, runId, "eval_live_should_not_win");

    expect(loadTerminalJobEvaluationId(runId)).toBe("eval_from_done");
    expect(
      resolveRetryEvaluationId({
        runId,
        status: {},
        result: null,
      }),
    ).toBe("eval_from_done");
    // Terminals win for display too when done has the id.
    expect(
      resolveRunDetailEvaluationId({
        runId,
        status: {},
        result: null,
      }),
    ).toBe("eval_from_done");
  });

  it("does not use live .json for retry when terminals lack evaluationId", async () => {
    const { resolveRetryEvaluationId, resolveRunDetailEvaluationId } =
      await import("./runDetailEvaluationPack.js");
    const runId = "run_retry_nolive";
    writeLiveJob(`${runId}.json`, runId, "eval_live_only");
    expect(
      resolveRunDetailEvaluationId({
        runId,
        status: {},
        result: null,
      }),
    ).toBe("eval_live_only");
    expect(
      resolveRetryEvaluationId({
        runId,
        status: {},
        result: null,
      }),
    ).toBeNull();
  });
});
