import { describe, expect, it } from "vitest";
import {
  benefitListVerdictChipLabel,
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
