import { describe, expect, it } from "vitest";
import {
  loadPairWaitingWindDownRunIds,
  loadRunDetailEvaluationPack,
  resolveListRunEvaluationId,
  resolveRunDetailEvaluationId,
} from "./runDetailEvaluationPack.js";

describe("resolveRunDetailEvaluationId", () => {
  it("prefers status over job over result", () => {
    expect(
      resolveRunDetailEvaluationId({
        runId: "run_x",
        status: { evaluationId: "eval_status" },
        result: { evaluationId: "eval_result" },
        jobEvaluationId: "eval_job",
      }),
    ).toBe("eval_status");
  });

  it("uses job when status missing (failed without result.json)", () => {
    expect(
      resolveRunDetailEvaluationId({
        runId: "run_x",
        status: {},
        result: null,
        jobEvaluationId: "eval_from_job",
      }),
    ).toBe("eval_from_job");
  });

  it("falls back to result evaluationId", () => {
    expect(
      resolveRunDetailEvaluationId({
        runId: "run_x",
        status: null,
        result: { evaluationId: "eval_result" },
        jobEvaluationId: null,
      }),
    ).toBe("eval_result");
  });
});

describe("resolveListRunEvaluationId", () => {
  it("prefers status over result (unlike listRuns merge)", () => {
    expect(
      resolveListRunEvaluationId({
        runId: "run_list",
        statusEvaluationId: "eval_status",
        result: { evaluationId: "eval_result" },
        jobEvaluationId: null,
      }),
    ).toBe("eval_status");
  });

  it("uses job when status empty and result stale/missing", () => {
    expect(
      resolveListRunEvaluationId({
        runId: "run_list",
        statusEvaluationId: null,
        result: { evaluationId: undefined },
        jobEvaluationId: "eval_job",
      }),
    ).toBe("eval_job");
  });
});

describe("loadRunDetailEvaluationPack", () => {
  it("builds pairHarness from status-only evaluationId", () => {
    const out = loadRunDetailEvaluationPack({
      runId: "run_failed",
      status: { evaluationId: "eval_1" },
      result: null,
      jobEvaluationId: null,
      loadPacked: () =>
        ({
          meta: {
            smoke: false,
            baselineRunId: "run_b",
            candidateRunId: "run_failed",
          },
          comparison: null,
          baseline: {
            capture: { env: { fakeProduce: false, produceAttested: true } },
          },
          candidate: {
            capture: { env: { fakeProduce: true, produceAttested: false } },
          },
        }) as ReturnType<
          typeof import("@/lib/evaluations").loadEvaluationComparison
        >,
    });
    expect(out.evaluationId).toBe("eval_1");
    expect(out.tipCandidateRunId).toBe("run_failed");
    expect(out.pairHarness).toMatchObject({
      baselineRunId: "run_b",
      candidateRunId: "run_failed",
      candidateFakeProduce: true,
      baselineProduceAttested: true,
    });
  });

  it("surfaces provisional official PASS from packed comparison", () => {
    const out = loadRunDetailEvaluationPack({
      runId: "run_cand",
      status: { evaluationId: "eval_prov" },
      result: { evaluationId: "eval_prov" },
      loadPacked: () =>
        ({
          meta: { mode: "official", baselineRunId: "run_b", candidateRunId: "run_cand" },
          comparison: {
            verdict: "INCONCLUSIVE",
            mode: "official",
            adoptionConfirmation: { step: 1, required: 2 },
          },
          baseline: { mode: "official" },
          candidate: { mode: "official" },
        }) as ReturnType<
          typeof import("@/lib/evaluations").loadEvaluationComparison
        >,
    });
    expect(out.comparisonProvisional).toEqual({ step: 1, required: 2 });
    expect(out.metaMode).toBe("official");
  });

  it("returns null pack when no evaluationId source", () => {
    expect(
      loadRunDetailEvaluationPack({
        runId: "run_none",
        status: null,
        result: null,
        jobEvaluationId: null,
      }),
    ).toEqual({
      evaluationId: null,
      tipCandidateRunId: null,
      pairHarness: null,
    });
  });
});

describe("loadPairWaitingWindDownRunIds", () => {
  it("returns empty unless pairPending is waiting", () => {
    expect(
      loadPairWaitingWindDownRunIds({
        pairPending: "unavailable",
        baselineRunId: "run_b",
        candidateRunId: "run_c",
      }),
    ).toEqual([]);
    expect(
      loadPairWaitingWindDownRunIds({
        pairPending: undefined,
        baselineRunId: "run_b",
        candidateRunId: "run_c",
      }),
    ).toEqual([]);
  });

  it("returns empty when tip ids missing", () => {
    expect(
      loadPairWaitingWindDownRunIds({
        pairPending: "waiting",
        baselineRunId: null,
        candidateRunId: null,
      }),
    ).toEqual([]);
  });
});
