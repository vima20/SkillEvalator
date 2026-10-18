import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEvaluations = vi.fn();
const loadEvaluationComparison = vi.fn();
const syncStatusFromResult = vi.fn();

vi.mock("@skillevalator/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@skillevalator/core")>();
  return {
    ...actual,
    syncStatusFromResult: (root: string, runId: string) =>
      syncStatusFromResult(root, runId),
  };
});

vi.mock("@/lib/evaluations", () => ({
  listEvaluations: () => listEvaluations(),
  loadEvaluationComparison: (id: string) => loadEvaluationComparison(id),
  resolveTipBaselineRunId: (packed: {
    comparison?: { baselineRunId?: string } | null;
    meta?: { baselineRunId?: string } | null;
  }) => packed.comparison?.baselineRunId ?? packed.meta?.baselineRunId ?? null,
  resolveTipCandidateRunId: (packed: {
    comparison?: { candidateRunId?: string } | null;
    meta?: { candidateRunId?: string } | null;
  }) =>
    packed.comparison?.candidateRunId ?? packed.meta?.candidateRunId ?? null,
}));

vi.mock("@/lib/paths", () => ({
  resultsDir: () => "/tmp/se-results",
}));

describe("hasPendingEvaluations", () => {
  beforeEach(() => {
    listEvaluations.mockReset();
    loadEvaluationComparison.mockReset();
    syncStatusFromResult.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("is true when a tip leg is still queued without Comparison", async () => {
    listEvaluations.mockReturnValue([{ evaluationId: "eval_pending" }]);
    loadEvaluationComparison.mockReturnValue({
      comparison: null,
      meta: {
        baselineRunId: "run_base",
        candidateRunId: "run_cand",
      },
      baseline: { status: "ok" },
      candidate: null,
    });
    syncStatusFromResult.mockImplementation((_root: string, runId: string) =>
      runId === "run_base"
        ? { status: "ok" }
        : { status: "queued" },
    );
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(true);
  });

  it("is false when both tips are cancelled without result.json", async () => {
    listEvaluations.mockReturnValue([{ evaluationId: "eval_cancelled" }]);
    loadEvaluationComparison.mockReturnValue({
      comparison: null,
      meta: {
        baselineRunId: "run_base",
        candidateRunId: "run_cand",
      },
      baseline: null,
      candidate: null,
    });
    syncStatusFromResult.mockImplementation(() => ({ status: "cancelled" }));
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(false);
  });

  it("is false when both tips have results but Comparison is missing", async () => {
    listEvaluations.mockReturnValue([{ evaluationId: "eval_stuck" }]);
    loadEvaluationComparison.mockReturnValue({
      comparison: null,
      baseline: { status: "failed" },
      candidate: { status: "cancelled" },
    });
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(false);
  });

  it("is false when every evaluation has Comparison", async () => {
    listEvaluations.mockReturnValue([{ evaluationId: "eval_done" }]);
    loadEvaluationComparison.mockReturnValue({
      comparison: { verdict: "FAIL" },
      baseline: { status: "ok" },
      candidate: { status: "ok" },
    });
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(false);
  });

  it("is false when there are no evaluations", async () => {
    listEvaluations.mockReturnValue([]);
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(false);
  });
});
