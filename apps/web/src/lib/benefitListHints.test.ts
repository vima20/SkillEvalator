import { describe, expect, it } from "vitest";
import {
  benefitListPairBlocksAdoption,
  benefitListPairChip,
  benefitListPairLockedLabel,
  benefitPairCtaLabel,
  benefitPairEvidenceFromPacked,
} from "./benefitListHints.js";

describe("benefitListPairChip", () => {
  it("returns null when unpaired", () => {
    expect(
      benefitListPairChip({
        paired: false,
        baselineFakeProduce: true,
        candidateFakeProduce: true,
      }),
    ).toBeNull();
  });

  it("labels mixed, smoke, and not attested like Comparison list", () => {
    expect(
      benefitListPairChip({
        paired: true,
        baselineFakeProduce: true,
        candidateFakeProduce: false,
        candidateHasResult: true,
        candidateProduceAttested: true,
      }),
    ).toBe("mixed");
    expect(
      benefitListPairChip({
        paired: true,
        metaSmoke: true,
        baselineHasResult: true,
        candidateHasResult: true,
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }),
    ).toBe("smoke");
    expect(
      benefitListPairChip({
        paired: true,
        baselineHasResult: true,
        candidateHasResult: true,
        candidateProduceAttested: true,
      }),
    ).toBe("not attested");
    expect(
      benefitListPairChip({
        paired: true,
        baselineHasResult: true,
        candidateHasResult: true,
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }),
    ).toBeNull();
  });

  it("does not mark not attested while tip result is still missing", () => {
    expect(
      benefitListPairChip({
        paired: true,
        candidateHasResult: true,
        candidateProduceAttested: true,
      }),
    ).toBeNull();
  });
});

describe("benefitListPairBlocksAdoption", () => {
  it("blocks sibling FAKE / unattested tip pairs", () => {
    expect(
      benefitListPairBlocksAdoption({
        baselineFakeProduce: true,
        candidateProduceAttested: true,
      }),
    ).toBe(true);
    expect(
      benefitListPairBlocksAdoption({
        baselineProduceAttested: true,
        candidateProduceAttested: true,
      }),
    ).toBe(false);
  });
});

describe("benefitListPairLockedLabel", () => {
  it("maps chips to Report CTA labels", () => {
    expect(benefitListPairLockedLabel("mixed")).toBe("locked · mixed");
    expect(benefitListPairLockedLabel(null)).toBe("locked · pair evidence");
  });
});

describe("benefitPairEvidenceFromPacked", () => {
  it("marks mixed sibling FAKE as pair-blocked with chip", () => {
    const out = benefitPairEvidenceFromPacked({
      tipBaselineRunId: "run_b",
      tipCandidateRunId: "run_c",
      baseline: {
        capture: { env: { fakeProduce: true, produceAttested: false } },
      },
      candidate: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
    });
    expect(out.paired).toBe(true);
    expect(out.pairChip).toBe("mixed");
    expect(out.pairBlocked).toBe(true);
  });

  it("keeps clean live tips unblocked", () => {
    const out = benefitPairEvidenceFromPacked({
      tipBaselineRunId: "run_b",
      tipCandidateRunId: "run_c",
      baseline: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
      candidate: {
        capture: { env: { fakeProduce: false, produceAttested: true } },
      },
    });
    expect(out.pairChip).toBeNull();
    expect(out.pairBlocked).toBe(false);
  });
});

describe("benefitPairCtaLabel", () => {
  it("mirrors Comparison list waiting/unavailable labels", () => {
    expect(benefitPairCtaLabel("waiting").label).toBe("Benefit · waiting");
    expect(benefitPairCtaLabel("unavailable").label).toBe(
      "Benefit · unavailable",
    );
    expect(benefitPairCtaLabel(undefined).label).toBe("Benefit");
    expect(
      benefitPairCtaLabel(undefined, { readyLabel: "Open report" }).label,
    ).toBe("Open report");
    expect(benefitPairCtaLabel("waiting", { detailArrow: true }).label).toBe(
      "Open Benefit · waiting →",
    );
    expect(
      benefitPairCtaLabel(undefined, {
        comparisonMetaTitle: "Provisional official PASS",
      }).title,
    ).toBe("Provisional official PASS");
  });
});
