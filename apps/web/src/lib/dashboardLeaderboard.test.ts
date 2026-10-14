import { describe, expect, it } from "vitest";
import { includeInDashboardLeaderboard } from "./dashboardLeaderboard.js";

describe("includeInDashboardLeaderboard", () => {
  it("keeps tip candidate and unpaired candidate", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_tip",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe(true);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_solo",
        role: "candidate",
      }),
    ).toBe(true);
  });

  it("rejects baseline, smoke, and superseded tip", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_base",
        role: "baseline",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe(false);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_smoke",
        role: "candidate",
        fakeProduce: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_smoke",
      }),
    ).toBe(false);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_old",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe(false);
  });

  it("keeps paired candidate when Comparison tip is not ready yet", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_waiting",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: null,
      }),
    ).toBe(true);
  });
});
