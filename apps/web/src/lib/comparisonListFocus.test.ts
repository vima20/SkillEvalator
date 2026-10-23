import { describe, expect, it } from "vitest";
import { isPilotNoiseEvaluation } from "./comparisonListFocus.js";
import {
  evaluationPairBrowseFromPacked,
  listRowAdoptionMode,
  pairedEvalDisplayModeFromPacked,
  type PackedEvaluationBrowse,
} from "./evaluationPairBrowse.js";
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
    const fromPacked = pairedEvalDisplayModeFromPacked({
      meta: { mode: "official" },
      baseline: { mode: "dry-run" },
      candidate: { mode: "dry-run" },
    });
    expect(fromPacked).toBe("dry-run");
    const displayMode =
      pairedEvalDisplayMode({
        metaMode: "official",
        baselineMode: "dry-run",
        candidateMode: "dry-run",
      }) ?? "official";
    expect(displayMode).toBe("dry-run");
    expect(isPilotNoiseEvaluation({ displayMode, verdict: null })).toBe(true);
  });

  it("keeps provisional official PASS 1/N visible in Pilot focus", () => {
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "INCONCLUSIVE",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe(false);
  });

  it("hides pair-blocked sibling evidence in pilot focus", () => {
    expect(
      isPilotNoiseEvaluation({
        displayMode: "official",
        verdict: "PASS",
        pairBlocked: true,
      }),
    ).toBe(true);
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

  it("pending rows use tip mode so official pairs stay in pilot focus", () => {
    const packed = {
      meta: { mode: "dry-run", baselineRunId: "b", candidateRunId: "c" },
      baseline: { mode: "official" },
      candidate: { mode: "official" },
    } as PackedEvaluationBrowse;
    const browse = evaluationPairBrowseFromPacked(packed);
    const displayMode = listRowAdoptionMode(browse, "dry-run");
    expect(displayMode).toBe("official");
    expect(isPilotNoiseEvaluation({ displayMode, verdict: null })).toBe(false);
  });
});
