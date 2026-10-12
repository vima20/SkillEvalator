import { describe, expect, it } from "vitest";
import {
  LIFT_PASS_DELTA,
  compareBaselineCandidate,
  pairEvaluationRuns,
} from "./comparison.js";
import type { RunResult } from "./schema.js";

function sample(over: Partial<RunResult> & Pick<RunResult, "runId" | "role">): RunResult {
  return {
    runId: over.runId,
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    capture: {
      githubUrl:
        "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
      commit: "deadbeef",
      license: "MIT",
      dependencies: [],
      skillVersion: "abc",
      role: over.role ?? "candidate",
    },
    evaluationId: "eval_test_1",
    role: over.role ?? "candidate",
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4o-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: 1,
    aggregate: "mean",
    perTask: [],
    score: 0.9,
    subscores: {},
    rationale: "",
    findings: [],
    costUsd: 0.01,
    latencyMs: 1000,
    status: "ok",
    startedAt: "2026-10-12T00:00:00.000Z",
    finishedAt: "2026-10-12T00:01:00.000Z",
    mode: "dry-run",
    ...over,
  };
}

describe("compareBaselineCandidate", () => {
  it("PASS when lift clears delta", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.7 }),
      sample({ runId: "c", role: "candidate", score: 0.85 }),
    );
    expect(c.verdict).toBe("PASS");
    expect(c.lift).toBeCloseTo(0.15);
    expect(c.lift!).toBeGreaterThanOrEqual(LIFT_PASS_DELTA);
  });

  it("FAIL when lift too small", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.9 }),
      sample({ runId: "c", role: "candidate", score: 0.92 }),
    );
    expect(c.verdict).toBe("FAIL");
    expect(c.lift).toBeCloseTo(0.02);
  });

  it("FAIL when candidate below soft-pass floor", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.2 }),
      sample({ runId: "c", role: "candidate", score: 0.5 }),
    );
    expect(c.verdict).toBe("FAIL");
  });

  it("INCONCLUSIVE on cancelled", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, status: "cancelled" }),
      sample({ runId: "c", role: "candidate", score: 0.9 }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
  });
});

describe("pairEvaluationRuns", () => {
  it("finds baseline and candidate", () => {
    const { baseline, candidate } = pairEvaluationRuns([
      sample({ runId: "c", role: "candidate" }),
      sample({ runId: "b", role: "baseline" }),
    ]);
    expect(baseline?.runId).toBe("b");
    expect(candidate?.runId).toBe("c");
  });
});
