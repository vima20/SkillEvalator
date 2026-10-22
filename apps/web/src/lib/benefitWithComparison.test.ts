import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_MIN_REPEATS } from "@skillevalator/core";
import type { RunComparison, RunResult } from "@skillevalator/core";
import type { loadEvaluationComparison } from "@/lib/evaluations";
import { buildBenefitReportBundle } from "./benefitWithComparison.js";

vi.mock("@/lib/evaluations", () => ({
  loadEvaluationComparison: vi.fn(),
  resolveTipCandidateRunId: () => "run_cand_tip",
  resolveTipBaselineRunId: () => "run_base_tip",
}));

function officialCandidate(): RunResult {
  return {
    runId: "run_cand_tip",
    evalSkillId: "code-debugging-eval",
    evalSkillVersion: "abc",
    evalSkillGithubUrl:
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills/code-debugging-eval",
    evaluationId: "eval_stale_cmp",
    taskSetId: "cde-v1",
    taskIds: ["bug-01"],
    pipeline: { produce: "model", grade: "docker_script" },
    modelId: "gpt-4.1-mini",
    decoding: { temperature: 0, top_p: 1, seed: 42 },
    repeats: OFFICIAL_MIN_REPEATS,
    scoreSpread: 0,
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
    latencyMs: 1000,
    status: "ok",
    startedAt: "2026-10-14T00:00:00.000Z",
    finishedAt: "2026-10-14T00:01:00.000Z",
    mode: "official",
    role: "candidate",
    capture: {
      env: { fakeProduce: false, produceAttested: true },
    } as RunResult["capture"],
  };
}

describe("buildBenefitReportBundle", () => {
  it("forwards tip leg modes so USE is not blocked by stale comparison.json dry-run", async () => {
    const { loadEvaluationComparison } = await import("@/lib/evaluations.js");
    vi.mocked(loadEvaluationComparison).mockReturnValue({
      meta: { mode: "dry-run", smoke: false },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      comparison: {
        verdict: "PASS",
        mode: "dry-run",
        candidateRunId: "run_cand_tip",
        baselineRunId: "run_base_tip",
      } as RunComparison,
    } as ReturnType<typeof loadEvaluationComparison>);
    const { report } = buildBenefitReportBundle(officialCandidate(), {
      evaluationId: "eval_stale_cmp",
    });
    expect(report.verdict.recommendation).toBe("use");
  });
});
