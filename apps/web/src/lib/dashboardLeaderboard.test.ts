import { describe, expect, it } from "vitest";
import { includeInDashboardLeaderboard } from "./dashboardLeaderboard.js";

describe("includeInDashboardLeaderboard", () => {
  it("keeps tip candidate and unpaired candidate", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe(true);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_solo",
        role: "candidate",
        produceAttested: true,
      }),
    ).toBe(true);
  });

  it("rejects baseline, smoke, unattested, and superseded tip", () => {
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
        runId: "run_plant",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_plant",
      }),
    ).toBe(false);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_old",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe(false);
  });

  it("rejects paired candidate when tip is unknown (fail-closed)", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_waiting",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: null,
      }),
    ).toBe(false);
  });

  it("rejects superseded when tip comes from healed meta (no Comparison yet)", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_old",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip_from_meta",
      }),
    ).toBe(false);
  });

  it("pilot focus keeps only official tip candidates", () => {
    expect(
      includeInDashboardLeaderboard({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
        mode: "official",
        pilotFocus: true,
      }),
    ).toBe(true);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
        mode: "dry-run",
        pilotFocus: true,
      }),
    ).toBe(false);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_solo",
        role: "candidate",
        produceAttested: true,
        mode: "official",
        pilotFocus: true,
      }),
    ).toBe(false);
    expect(
      includeInDashboardLeaderboard({
        runId: "run_smoke",
        role: "candidate",
        fakeProduce: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_smoke",
        mode: "official",
        pilotFocus: true,
      }),
    ).toBe(false);
  });
});
