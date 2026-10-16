import { describe, expect, it } from "vitest";
import { benefitCtaHint } from "./runDetailHints.js";

describe("benefitCtaHint", () => {
  it("routes baseline to Comparison and candidate tip to Benefit", () => {
    expect(
      benefitCtaHint({
        runId: "run_b",
        role: "baseline",
        evaluationId: "eval_1",
      }),
    ).toEqual({
      kind: "baseline",
      comparisonHref: "/comparison/eval_1",
    });
    expect(
      benefitCtaHint({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toEqual({ kind: "tip" });
  });

  it("demotes smoke, not_attested, and superseded candidate", () => {
    expect(
      benefitCtaHint({
        runId: "run_smoke",
        role: "candidate",
        evaluationId: "eval_1",
        fakeProduce: true,
        tipCandidateRunId: "run_smoke",
      }),
    ).toEqual({ kind: "smoke" });
    expect(
      benefitCtaHint({
        runId: "run_plant",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_plant",
      }),
    ).toEqual({ kind: "not_attested" });
    expect(
      benefitCtaHint({
        runId: "run_old",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toEqual({ kind: "superseded", tipRunId: "run_tip" });
  });

  it("demotes tip when sibling tip fails pair evidence", () => {
    expect(
      benefitCtaHint({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
        pairEvidence: {
          baselineFakeProduce: true,
          candidateFakeProduce: false,
          candidateProduceAttested: true,
        },
      }),
    ).toEqual({
      kind: "pair_blocked",
      comparisonHref: "/comparison/eval_1",
    });
    expect(
      benefitCtaHint({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
        pairEvidence: {
          baselineProduceAttested: true,
          candidateProduceAttested: true,
        },
      }),
    ).toEqual({ kind: "tip" });
  });
});
