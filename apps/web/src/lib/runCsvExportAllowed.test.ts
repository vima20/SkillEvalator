import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/evaluations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/evaluations")>();
  return {
    ...actual,
    loadEvaluationComparison: vi.fn(),
  };
});

import { loadEvaluationComparison } from "@/lib/evaluations";
import { runCsvExportGateForRun } from "./runCsvExportAllowed.js";

describe("runCsvExportGateForRun", () => {
  it("allows export when comparison.json mode is stale but tip legs are official", () => {
    vi.mocked(loadEvaluationComparison).mockReturnValue({
      comparison: { verdict: "PASS", mode: "dry-run" },
      meta: {
        mode: "dry-run",
        baselineRunId: "run_b",
        candidateRunId: "run_c",
      },
      baseline: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
      candidate: {
        mode: "official",
        capture: { env: { produceAttested: true } },
      },
    } as ReturnType<typeof loadEvaluationComparison>);

    const gate = runCsvExportGateForRun({
      runId: "run_c",
      result: {
        runId: "run_c",
        mode: "official",
        evaluationId: "eval_stale",
        status: "ok",
        capture: { env: { fakeProduce: false, produceAttested: true } },
      } as import("@skillevalator/core").RunResult,
    });
    expect(gate.ok).toBe(true);
  });
});
