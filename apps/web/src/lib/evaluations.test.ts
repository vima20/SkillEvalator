import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "@skillevalator/core";

const temps: string[] = [];
let resultsRoot = "";

vi.mock("@/lib/paths", () => ({
  resultsDir: () => resultsRoot,
  jobsDir: () => path.join(resultsRoot, "..", "jobs"),
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-web-eval-"));
  temps.push(root);
  resultsRoot = path.join(root, "results");
  fs.mkdirSync(resultsRoot, { recursive: true });
});

function sampleResult(opts: {
  runId: string;
  role: "baseline" | "candidate";
  mode: "dry-run" | "official";
  evaluationId: string;
  score: number;
}) {
  return {
    runId: opts.runId,
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    evaluationId: opts.evaluationId,
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    perTask: [],
    score: opts.score,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    status: "ok",
    startedAt: "2026-10-12T00:00:00.000Z",
    finishedAt: "2026-10-12T00:01:00.000Z",
    mode: opts.mode,
    role: opts.role,
    capture: {
      githubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      commit: "deadbeef",
      license: "MIT",
      dependencies: [],
      skillVersion: "abc",
      role: opts.role,
      promptHash: opts.role === "baseline" ? "basehash00000001" : "candhash00000002",
      promptKind: opts.role === "baseline" ? "baseline_neutral" : "skill_md",
    },
  };
}

describe("loadEvaluationComparison meta mode", () => {
  it("INCONCLUSIVE when evaluation.json mode is garbage even if legs agree", async () => {
    const evaluationId = "eval_100_badmode";
    const baselineRunId = "run_100_base_bm";
    const candidateRunId = "run_100_cand_bm";

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      mode: "prod",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });
    writeJsonFile(
      path.join(resultsRoot, baselineRunId, "result.json"),
      sampleResult({
        runId: baselineRunId,
        role: "baseline",
        mode: "dry-run",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(resultsRoot, candidateRunId, "result.json"),
      sampleResult({
        runId: candidateRunId,
        role: "candidate",
        mode: "dry-run",
        evaluationId,
        score: 0.95,
      }),
    );

    const { loadEvaluationComparison } = await import("./evaluations.js");
    const out = loadEvaluationComparison(evaluationId);
    expect(out.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(
      out.comparison?.parity.issues.some((i) => i.includes("invalid")),
    ).toBe(true);
  });
});

describe("updateEvaluationMetaLeg", () => {
  it("syncs mode so comparison meta parity matches retried legs", async () => {
    const evaluationId = "eval_100_modesync";
    const baselineRunId = "run_100_base_dry";
    const candidateRunId = "run_100_cand_dry";

    writeJsonFile(path.join(resultsRoot, evaluationId, "evaluation.json"), {
      evaluationId,
      evalSkillId: "code-debugging-eval",
      // Stale meta mode — legs are dry-run (retry re-linked without mode sync).
      mode: "official",
      baselineRunId,
      candidateRunId,
      createdAt: "2026-10-12T00:00:00.000Z",
    });

    writeJsonFile(
      path.join(resultsRoot, baselineRunId, "result.json"),
      sampleResult({
        runId: baselineRunId,
        role: "baseline",
        mode: "dry-run",
        evaluationId,
        score: 0.5,
      }),
    );
    writeJsonFile(
      path.join(resultsRoot, candidateRunId, "result.json"),
      sampleResult({
        runId: candidateRunId,
        role: "candidate",
        mode: "dry-run",
        evaluationId,
        score: 0.95,
      }),
    );

    const { updateEvaluationMetaLeg, loadEvaluationComparison } = await import(
      "./evaluations.js"
    );

    const before = loadEvaluationComparison(evaluationId);
    expect(before.comparison).not.toBeNull();
    expect(before.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(
      before.comparison?.parity.issues.some((i) =>
        i.includes("evaluation meta mode"),
      ),
    ).toBe(true);

    expect(
      updateEvaluationMetaLeg({
        evaluationId,
        role: "candidate",
        runId: candidateRunId,
        mode: "dry-run",
        evalSkillId: "code-debugging-eval",
      }),
    ).toBe(true);

    const meta = JSON.parse(
      fs.readFileSync(
        path.join(resultsRoot, evaluationId, "evaluation.json"),
        "utf8",
      ),
    ) as { mode: string; candidateRunId: string };
    expect(meta.mode).toBe("dry-run");
    expect(meta.candidateRunId).toBe(candidateRunId);

    const after = loadEvaluationComparison(evaluationId);
    expect(
      after.comparison?.parity.issues.some((i) =>
        i.includes("evaluation meta mode"),
      ),
    ).toBe(false);
    // Dry-run never emits adoption PASS even when lift clears delta.
    expect(after.comparison?.verdict).toBe("INCONCLUSIVE");
    expect(after.comparison?.lift).toBeGreaterThan(0);
  });
});
