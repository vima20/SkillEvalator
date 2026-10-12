import { describe, expect, it } from "vitest";
import {
  LIFT_PASS_DELTA,
  compareBaselineCandidate,
  pairEvaluationRuns,
  resolveComparisonLegs,
  resolvePairedCancelSibling,
} from "./comparison.js";
import type { RunResult } from "./schema.js";

function sample(over: Partial<RunResult> & Pick<RunResult, "runId" | "role">): RunResult {
  const { runId, role, ...rest } = over;
  const resolvedRole = role ?? "candidate";
  return {
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
      role: resolvedRole,
    },
    evaluationId: "eval_test_1",
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
    ...rest,
    runId,
    role: resolvedRole,
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

  it("INCONCLUSIVE on parity mismatch", () => {
    const c = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5, modelId: "gpt-4o-mini" }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        modelId: "gpt-4.1-mini",
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("modelId"))).toBe(true);
  });

  it("INCONCLUSIVE when evalSkillId differs on shared task set", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillId: "code-debugging-eval",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillId: "code-debugging-eval-checklist",
      }),
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(c.parity.ok).toBe(false);
    expect(c.parity.issues.some((i) => i.includes("evalSkillId"))).toBe(true);
  });

  it("INCONCLUSIVE when legs disagree with evaluation meta evalSkillId", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.5,
        evalSkillId: "code-debugging-eval",
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        evalSkillId: "code-debugging-eval",
      }),
      { expectedEvalSkillId: "code-debugging-eval-checklist" },
    );
    expect(c.verdict).toBe("INCONCLUSIVE");
    expect(
      c.parity.issues.some((i) => i.includes("evaluation meta")),
    ).toBe(true);
  });

  it("INCONCLUSIVE when decoding.seed or pipeline.grade differs", () => {
    const seedMismatch = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        decoding: { temperature: 0, top_p: 1, seed: 99 },
      }),
    );
    expect(seedMismatch.verdict).toBe("INCONCLUSIVE");
    expect(seedMismatch.parity.issues.some((i) => i.includes("seed"))).toBe(
      true,
    );

    const gradeMismatch = compareBaselineCandidate(
      sample({ runId: "b", role: "baseline", score: 0.5 }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.95,
        pipeline: { produce: "model", grade: "host_script" },
      }),
    );
    expect(gradeMismatch.verdict).toBe("INCONCLUSIVE");
    expect(
      gradeMismatch.parity.issues.some((i) => i.includes("pipeline.grade")),
    ).toBe(true);
  });

  it("flags per-task regressions", () => {
    const c = compareBaselineCandidate(
      sample({
        runId: "b",
        role: "baseline",
        score: 0.8,
        perTask: [
          {
            taskId: "bug-01",
            score: 1,
            status: "ok",
            scriptResults: [],
          },
          {
            taskId: "bug-02",
            score: 0.9,
            status: "ok",
            scriptResults: [],
          },
        ],
      }),
      sample({
        runId: "c",
        role: "candidate",
        score: 0.9,
        perTask: [
          {
            taskId: "bug-01",
            score: 0.5,
            status: "failed",
            scriptResults: [],
          },
          {
            taskId: "bug-02",
            score: 1,
            status: "ok",
            scriptResults: [],
          },
        ],
      }),
    );
    expect(c.regressions).toBe(1);
    expect(c.improvements).toBe(1);
    expect(c.perTask.find((t) => t.taskId === "bug-01")?.regression).toBe(true);
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

  it("picks the newest candidate when retries left multiple legs", () => {
    const { candidate } = pairEvaluationRuns([
      sample({
        runId: "run_old_cand",
        role: "candidate",
        startedAt: "2026-10-12T00:00:00.000Z",
        finishedAt: "2026-10-12T00:01:00.000Z",
      }),
      sample({
        runId: "run_new_cand",
        role: "candidate",
        startedAt: "2026-10-12T00:10:00.000Z",
        finishedAt: "2026-10-12T00:11:00.000Z",
      }),
      sample({ runId: "run_base", role: "baseline" }),
    ]);
    expect(candidate?.runId).toBe("run_new_cand");
  });
});

describe("resolveComparisonLegs", () => {
  it("does not fill a missing meta leg from older same-evaluation results", () => {
    const oldCand = sample({
      runId: "run_old_ok",
      role: "candidate",
      score: 0.95,
      status: "ok",
    });
    const base = sample({ runId: "run_base", role: "baseline", score: 0.7 });
    const byId = new Map<string, RunResult>([
      [base.runId, base],
      [oldCand.runId, oldCand],
    ]);

    const { baseline, candidate } = resolveComparisonLegs({
      meta: {
        baselineRunId: "run_base",
        candidateRunId: "run_retry_orphan",
      },
      loadResult: (id) => byId.get(id) ?? null,
      scanByEvaluationId: () => [base, oldCand],
    });

    expect(baseline?.runId).toBe("run_base");
    expect(candidate).toBeNull();
  });

  it("uses scan fallback only when meta is missing", () => {
    const base = sample({ runId: "run_base", role: "baseline" });
    const cand = sample({ runId: "run_cand", role: "candidate" });
    const { baseline, candidate } = resolveComparisonLegs({
      meta: null,
      loadResult: () => null,
      scanByEvaluationId: () => [cand, base],
    });
    expect(baseline?.runId).toBe("run_base");
    expect(candidate?.runId).toBe("run_cand");
  });
});

describe("resolvePairedCancelSibling", () => {
  it("cascades only the opposite meta leg", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_base",
        role: "baseline",
        meta: {
          baselineRunId: "run_base",
          candidateRunId: "run_cand",
        },
        peers: [
          { runId: "run_cand", role: "candidate", status: "running" },
          { runId: "run_old", role: "candidate", status: "running" },
        ],
      }),
    ).toBe("run_cand");
  });

  it("does not cascade when runId is superseded (not in meta)", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_old_cand",
        role: "candidate",
        meta: {
          baselineRunId: "run_base",
          candidateRunId: "run_new_cand",
        },
        peers: [
          { runId: "run_base", role: "baseline", status: "running" },
          { runId: "run_new_cand", role: "candidate", status: "running" },
        ],
      }),
    ).toBeNull();
  });

  it("without meta cancels the sole live peer", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_base",
        role: "baseline",
        meta: null,
        peers: [
          { runId: "run_cand", role: "candidate", status: "queued" },
          { runId: "run_done", role: "candidate", status: "ok" },
        ],
      }),
    ).toBe("run_cand");
  });

  it("without meta refuses ambiguous peers", () => {
    expect(
      resolvePairedCancelSibling({
        runId: "run_x",
        meta: null,
        peers: [
          { runId: "run_a", status: "queued" },
          { runId: "run_b", status: "running" },
        ],
      }),
    ).toBeNull();
  });
});
