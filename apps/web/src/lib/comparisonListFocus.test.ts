import { describe, expect, it } from "vitest";
import { isPilotNoiseEvaluation } from "./comparisonListFocus.js";
import { pairedEvalDisplayMode } from "./pilotFocusHref.js";

describe("isPilotNoiseEvaluation", () => {
  it("keeps official PASS/FAIL and waiting pairs", () => {
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        smoke: false,
        verdict: "PASS",
      }),
    ).toBe(false);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "FAIL",
      }),
    ).toBe(false);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: null,
      }),
    ).toBe(false);
  });

  it("hides stale-meta official when tip legs are dry-run", () => {
    const displayMode =
      pairedEvalDisplayMode({
        metaMode: "official",
        baselineMode: "dry-run",
        candidateMode: "dry-run",
      }) ?? "official";
    expect(displayMode).toBe("dry-run");
    expect(isPilotNoiseEvaluation({ displayMode, verdict: null })).toBe(true);
  });

  it("hides dry-run, smoke meta, FAKE_PRODUCE, and official INCONCLUSIVE", () => {
    expect(isPilotNoiseEvaluation({ displayMode: "dry-run" })).toBe(true);
    expect(
      isPilotNoiseEvaluation({ displayMode: "official", smoke: true }),
    ).toBe(true);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        candidateFakeProduce: true,
      }),
    ).toBe(true);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        baselineFakeProduce: true,
      }),
    ).toBe(true);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "INCONCLUSIVE",
      }),
    ).toBe(true);
  });

  it("hides tip results missing produceAttested; keeps in-flight waiting", () => {
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "PASS",
        candidateHasResult: true,
        candidateProduceAttested: false,
      }),
    ).toBe(true);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: null,
        baselineHasResult: false,
        candidateHasResult: false,
      }),
    ).toBe(false);
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "PASS",
        baselineHasResult: true,
        candidateHasResult: true,
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }),
    ).toBe(false);
  });
});
