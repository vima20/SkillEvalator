import { describe, expect, it } from "vitest";
import {
  candidateLegKind,
  candidateLegSortRank,
  includeInPilotFocusRun,
  isPilotNoiseLeg,
} from "./candidateLeg.js";

describe("candidateLegKind", () => {
  it("classifies tip, superseded, smoke, not_attested, single, waiting", () => {
    expect(
      candidateLegKind({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe("tip");
    expect(
      candidateLegKind({
        runId: "run_old",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe("superseded");
    expect(
      candidateLegKind({
        runId: "run_s",
        role: "candidate",
        fakeProduce: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_s",
      }),
    ).toBe("smoke");
    expect(
      candidateLegKind({
        runId: "run_plant",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_plant",
      }),
    ).toBe("not_attested");
    expect(
      candidateLegKind({
        runId: "run_u",
        role: "candidate",
        produceAttested: true,
      }),
    ).toBe("single");
    expect(
      candidateLegKind({
        runId: "run_w",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: null,
      }),
    ).toBe("waiting");
    expect(candidateLegKind({ runId: "run_b", role: "baseline" })).toBeNull();
  });

  it("marks smoke, not_attested, and superseded as pilot noise", () => {
    expect(isPilotNoiseLeg("smoke")).toBe(true);
    expect(isPilotNoiseLeg("not_attested")).toBe(true);
    expect(isPilotNoiseLeg("superseded")).toBe(true);
    expect(isPilotNoiseLeg("tip")).toBe(false);
    expect(isPilotNoiseLeg("waiting")).toBe(false);
    expect(isPilotNoiseLeg(null)).toBe(false);
  });

  it("pilot focus hides smoke, not_attested, superseded, fakeProduce, and dry-run", () => {
    expect(
      includeInPilotFocusRun({
        kind: "tip",
        mode: "official",
        produceAttested: true,
        hasResult: true,
      }),
    ).toBe(true);
    expect(
      includeInPilotFocusRun({
        kind: "tip",
        mode: "dry-run",
        produceAttested: true,
        hasResult: true,
      }),
    ).toBe(false);
    expect(
      includeInPilotFocusRun({
        kind: "smoke",
        mode: "official",
        hasResult: true,
      }),
    ).toBe(false);
    expect(
      includeInPilotFocusRun({
        kind: "not_attested",
        mode: "official",
        hasResult: true,
      }),
    ).toBe(false);
    expect(
      includeInPilotFocusRun({
        kind: "tip",
        mode: "official",
        fakeProduce: true,
        hasResult: true,
      }),
    ).toBe(false);
    expect(
      includeInPilotFocusRun({
        kind: null,
        mode: "dry-run",
        hasResult: false,
      }),
    ).toBe(true);
  });

  it("ranks tip before smoke", () => {
    expect(candidateLegSortRank("tip")).toBeLessThan(
      candidateLegSortRank("smoke"),
    );
    expect(candidateLegSortRank("not_attested")).toBeLessThan(
      candidateLegSortRank("smoke"),
    );
  });
});
