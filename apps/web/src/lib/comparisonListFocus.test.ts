import { describe, expect, it } from "vitest";
import { isPilotNoiseEvaluation } from "./comparisonListFocus.js";

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
});
