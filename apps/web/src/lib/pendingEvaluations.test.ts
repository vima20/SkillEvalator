import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEvaluations = vi.fn();
const loadEvaluationComparison = vi.fn();

vi.mock("@/lib/evaluations", () => ({
  listEvaluations: () => listEvaluations(),
  loadEvaluationComparison: (id: string) => loadEvaluationComparison(id),
}));

describe("hasPendingEvaluations", () => {
  beforeEach(() => {
    listEvaluations.mockReset();
    loadEvaluationComparison.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("is true when a tip leg is still active without Comparison", async () => {
    listEvaluations.mockReturnValue([
      { evaluationId: "eval_pending" },
      { evaluationId: "eval_done" },
    ]);
    loadEvaluationComparison.mockImplementation((id: string) =>
      id === "eval_done"
        ? { comparison: { verdict: "PASS" }, baseline: {}, candidate: {} }
        : {
            comparison: null,
            baseline: { status: "ok" },
            candidate: null,
          },
    );
    const { hasPendingEvaluations } = await import("./pendingEvaluations.js");
    expect(hasPendingEvaluations()).toBe(true);
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
