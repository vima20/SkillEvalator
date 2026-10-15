import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "./fsJson.js";
import {
  collectOfficialJobAttestationIssues,
  jobAttestationFromRunResult,
  resolveTrustedJobAttestationFromRunResultDir,
  resolveTrustedJobAttestationFromSnapshotDir,
} from "./jobSnapshot.js";
import type { RunResult } from "./schema.js";

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("resolveTrustedJobAttestationFromSnapshotDir", () => {
  it("reads complete job.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-job-snap-"));
    temps.push(root);
    writeJsonFile(path.join(root, "job.json"), {
      runId: "run_1",
      evalSkillId: "code-debugging-eval",
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      role: "candidate",
      evaluationId: "eval_1",
    });
    expect(resolveTrustedJobAttestationFromSnapshotDir(root)).toEqual({
      runId: "run_1",
      evalSkillId: "code-debugging-eval",
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      role: "candidate",
      evaluationId: "eval_1",
    });
  });

  it("returns undefined when incomplete", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-job-miss-"));
    temps.push(root);
    expect(resolveTrustedJobAttestationFromSnapshotDir(root)).toBeUndefined();
    writeJsonFile(path.join(root, "job.json"), { runId: "run_1" });
    expect(resolveTrustedJobAttestationFromSnapshotDir(root)).toBeUndefined();
  });
});

describe("resolveTrustedJobAttestationFromRunResultDir", () => {
  it("reads run skill-snapshot/job.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-job-run-"));
    temps.push(root);
    const runId = "run_job_1";
    const snap = path.join(root, runId, "skill-snapshot");
    fs.mkdirSync(snap, { recursive: true });
    writeJsonFile(path.join(snap, "job.json"), {
      runId,
      evalSkillId: "code-debugging-eval",
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      role: "baseline",
    });
    expect(resolveTrustedJobAttestationFromRunResultDir(root, runId)).toEqual({
      runId,
      evalSkillId: "code-debugging-eval",
      mode: "official",
      modelId: "gpt-4.1-mini",
      repeats: 3,
      role: "baseline",
    });
  });
});

describe("collectOfficialJobAttestationIssues", () => {
  const leg = {
    runId: "run_c",
    evalSkillId: "code-debugging-eval",
    mode: "official",
    modelId: "gpt-4.1-mini",
    repeats: 3,
    role: "candidate",
    evaluationId: "eval_1",
  } as RunResult;

  it("fail-closed when job missing", () => {
    expect(collectOfficialJobAttestationIssues("candidate", leg, undefined)).toEqual(
      [
        "official Comparison requires trusted candidate job.json (skill-snapshot)",
      ],
    );
  });

  it("flags repeats mismatch", () => {
    const expected = jobAttestationFromRunResult(leg)!;
    const issues = collectOfficialJobAttestationIssues("candidate", {
      ...leg,
      repeats: 1,
    }, expected);
    expect(issues.some((i) => /repeats ≠ skill-snapshot\/job\.json/.test(i))).toBe(
      true,
    );
  });
});
