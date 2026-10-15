import { describe, expect, it } from "vitest";
import {
  candidateRunsListHint,
  runsListHintLabel,
} from "./runsListHints.js";

describe("candidateRunsListHint", () => {
  it("labels tip, superseded, smoke, not_attested, and waiting", () => {
    expect(
      candidateRunsListHint({
        runId: "run_tip",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe("tip");
    expect(
      candidateRunsListHint({
        runId: "run_old",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_tip",
      }),
    ).toBe("superseded");
    expect(
      candidateRunsListHint({
        runId: "run_s",
        role: "candidate",
        fakeProduce: true,
        evaluationId: "eval_1",
        tipCandidateRunId: "run_s",
      }),
    ).toBe("smoke");
    expect(
      candidateRunsListHint({
        runId: "run_plant",
        role: "candidate",
        evaluationId: "eval_1",
        tipCandidateRunId: "run_plant",
      }),
    ).toBe("not_attested");
    expect(
      candidateRunsListHint({
        runId: "run_w",
        role: "candidate",
        produceAttested: true,
        evaluationId: "eval_1",
        tipCandidateRunId: null,
      }),
    ).toBe("waiting");
    expect(
      candidateRunsListHint({ runId: "run_b", role: "baseline" }),
    ).toBeNull();
  });

  it("formats hint labels", () => {
    expect(runsListHintLabel("waiting")).toBe("waiting tip");
    expect(runsListHintLabel("not_attested")).toBe("not attested");
    expect(runsListHintLabel(null)).toBeNull();
  });
});
