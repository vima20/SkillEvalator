import { describe, expect, it } from "vitest";
import {
  benefitListPairBlocksAdoption,
  benefitListPairChip,
  benefitListPairLockedLabel,
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
