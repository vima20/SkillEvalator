import { describe, expect, it } from "vitest";
import { comparisonHarnessHint } from "./comparisonDetailHints.js";

describe("comparisonHarnessHint", () => {
  it("is silent for clean official tips", () => {
    expect(
      comparisonHarnessHint({
        metaSmoke: false,
        baselineFakeProduce: false,
        candidateFakeProduce: false,
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }),
    ).toEqual({ kind: "none" });
  });

  it("flags both FAKE_PRODUCE tips", () => {
    expect(
      comparisonHarnessHint({
        baselineFakeProduce: true,
        candidateFakeProduce: true,
      }),
    ).toEqual({ kind: "both_smoke" });
  });

  it("flags asymmetric FAKE vs live tip", () => {
    expect(
      comparisonHarnessHint({
        baselineFakeProduce: true,
        candidateFakeProduce: false,
        candidateProduceAttested: true,
      }),
    ).toEqual({
      kind: "mixed",
      smokeRole: "baseline",
      liveRole: "candidate",
    });
    expect(
      comparisonHarnessHint({
        baselineFakeProduce: false,
        candidateFakeProduce: true,
        baselineProduceAttested: true,
      }),
    ).toEqual({
      kind: "mixed",
      smokeRole: "candidate",
      liveRole: "baseline",
    });
  });

  it("flags evaluation.smoke kept with a live attested tip", () => {
    expect(
      comparisonHarnessHint({
        metaSmoke: true,
        baselineFakeProduce: false,
        candidateFakeProduce: false,
        baselineProduceAttested: true,
        candidateProduceAttested: false,
      }),
    ).toEqual({ kind: "eval_smoke_with_live" });
  });

  it("flags evaluation.smoke plant without FAKE tip flags", () => {
    expect(
      comparisonHarnessHint({
        metaSmoke: true,
        baselineFakeProduce: false,
        candidateFakeProduce: false,
      }),
    ).toEqual({
      kind: "mixed",
      smokeRole: "both_flags",
      liveRole: null,
    });
  });
});
