import { describe, expect, it } from "vitest";
import { toListRunApiRow } from "./listRunsApi.js";

describe("toListRunApiRow", () => {
  it("uses resolved evaluationId when result lacks it (job/status path)", () => {
    const row = toListRunApiRow(
      {
        runId: "run_failed",
        status: { status: "failed" },
        result: null,
      },
      {
        resolveEvaluationId: () => "eval_from_job",
      },
    );
    expect(row.evaluationId).toBe("eval_from_job");
    expect(row.resolvedEvaluationId).toBe("eval_from_job");
    expect(row.score).toBeNull();
  });

  it("does not prefer stale result.evaluationId over resolver", () => {
    const row = toListRunApiRow(
      {
        runId: "run_x",
        status: { status: "ok" },
        result: {
          score: 0.9,
          evaluationId: "eval_result_stale",
          mode: "official",
          role: "candidate",
        },
      },
      {
        resolveEvaluationId: () => "eval_status",
      },
    );
    expect(row.evaluationId).toBe("eval_status");
    expect(row.resolvedEvaluationId).toBe("eval_status");
    expect(row.score).toBe(0.9);
    expect(row.role).toBe("candidate");
  });

  it("returns null evaluationId when nothing resolves", () => {
    const row = toListRunApiRow(
      {
        runId: "run_solo",
        status: { status: "queued" },
        result: undefined,
      },
      { resolveEvaluationId: () => null },
    );
    expect(row.evaluationId).toBeNull();
    expect(row.resolvedEvaluationId).toBeNull();
  });
});
