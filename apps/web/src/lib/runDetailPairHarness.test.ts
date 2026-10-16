import { describe, expect, it } from "vitest";
import { runDetailPairHarness } from "./runDetailPairHarness.js";

describe("runDetailPairHarness", () => {
  it("returns null when unpaired or meta missing", () => {
    expect(runDetailPairHarness(null)).toBeNull();
    expect(runDetailPairHarness({})).toBeNull();
    expect(
      runDetailPairHarness({
        meta: { smoke: true, baselineRunId: "b" },
      }),
    ).toBeNull();
  });

  it("maps tip ids and harness flags from packed evaluation", () => {
    const out = runDetailPairHarness({
      meta: {
        smoke: true,
        baselineRunId: "meta_b",
        candidateRunId: "meta_c",
      },
      comparison: {
        baselineRunId: "cmp_b",
        candidateRunId: "cmp_c",
      },
      baseline: {
        capture: { env: { fakeProduce: true, produceAttested: false } },
      },
      candidate: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
    });
    expect(out).toEqual({
      metaSmoke: true,
      baselineFakeProduce: true,
      candidateFakeProduce: false,
      baselineProduceAttested: false,
      candidateProduceAttested: true,
      baselineRunId: "cmp_b",
      candidateRunId: "cmp_c",
    });
  });

  it("falls back to meta tip ids when Comparison missing", () => {
    const out = runDetailPairHarness({
      meta: {
        smoke: false,
        baselineRunId: "meta_b",
        candidateRunId: "meta_c",
      },
      baseline: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
      candidate: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
    });
    expect(out?.baselineRunId).toBe("meta_b");
    expect(out?.candidateRunId).toBe("meta_c");
    expect(out?.metaSmoke).toBe(false);
    expect(out?.baselineProduceAttested).toBe(true);
  });
});
