import { describe, expect, it } from "vitest";
import {
  benefitListVerdictChipLabel,
  benefitVerdictChipToneFromComparison,
  comparisonVerdictBannerClass,
  comparisonVerdictChipTone,
  comparisonVerdictListLabel,
  isAdoptionConfirmationPending,
  isProvisionalOfficialPass,
} from "./comparisonVerdictDisplay.js";

describe("comparisonVerdictDisplay", () => {
  it("isAdoptionConfirmationPending when step < required", () => {
    expect(isAdoptionConfirmationPending({ step: 1, required: 2 })).toBe(true);
    expect(isAdoptionConfirmationPending({ step: 2, required: 2 })).toBe(false);
    expect(isAdoptionConfirmationPending(null)).toBe(false);
  });

  it("benefitVerdictChipToneFromComparison defers to Comparison when paired", () => {
    expect(
      benefitVerdictChipToneFromComparison({
        recommendation: "use",
        comparison: {
          verdict: "INCONCLUSIVE",
          adoptionConfirmation: { step: 1, required: 2 },
        },
        pairedDisplayMode: "official",
      }),
    ).toBe("inconclusive");
  });

  it("comparisonVerdictBannerClass matches chip tone for provisional 1/N", () => {
    expect(
      comparisonVerdictBannerClass({
        verdict: "INCONCLUSIVE",
        displayMode: "official",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe("verdict-banner verdict-inconclusive");
  });

  it("comparisonVerdictChipTone stays inconclusive for provisional 1/N", () => {
    expect(
      comparisonVerdictChipTone({
        verdict: "INCONCLUSIVE",
        displayMode: "official",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe("inconclusive");
    expect(
      comparisonVerdictChipTone({
        verdict: "PASS",
        displayMode: "official",
        adoptionConfirmation: { step: 2, required: 2 },
      }),
    ).toBe("use");
    expect(
      comparisonVerdictChipTone({
        verdict: "PASS",
        displayMode: "official",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe("inconclusive");
  });

  it("detects provisional official PASS 1/N", () => {
    expect(
      isProvisionalOfficialPass({
        verdict: "INCONCLUSIVE",
        displayMode: "official",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe(true);
    expect(
      comparisonVerdictListLabel({
        verdict: "INCONCLUSIVE",
        displayMode: "official",
        adoptionConfirmation: { step: 1, required: 2 },
      }),
    ).toBe("INCONCLUSIVE · 1/2");
  });

  it("benefitListVerdictChipLabel mirrors comparison list for provisional PASS", () => {
    expect(
      benefitListVerdictChipLabel({
        recommendation: "inconclusive",
        comparisonListLabel: "INCONCLUSIVE · 1/2",
      }),
    ).toBe("INCONCLUSIVE · 1/2");
    expect(
      benefitListVerdictChipLabel({
        recommendation: "use",
        comparisonListLabel: "PASS",
      }),
    ).toBe("USE");
  });

  it("leaves confirmed PASS unchanged", () => {
    expect(
      comparisonVerdictListLabel({
        verdict: "PASS",
        displayMode: "official",
        adoptionConfirmation: { step: 2, required: 2 },
      }),
    ).toBe("PASS");
  });
});
