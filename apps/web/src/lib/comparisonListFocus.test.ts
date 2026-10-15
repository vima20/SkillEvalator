import { describe, expect, it } from "vitest";
import { isPilotNoiseEvaluation } from "./comparisonListFocus.js";

describe("isPilotNoiseEvaluation", () => {
  it("keeps official live pairs", () => {
    expect(
      isPilotNoiseEvaluation({ displayMode: "official", smoke: false }),
    ).toBe(false);
  });

  it("hides dry-run, smoke meta, and FAKE_PRODUCE on either tip leg", () => {
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
  });
});
