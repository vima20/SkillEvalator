import { describe, expect, it } from "vitest";
import {
  comparisonVerdictListLabel,
  isProvisionalOfficialPass,
} from "./comparisonVerdictDisplay.js";

describe("comparisonVerdictDisplay", () => {
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
