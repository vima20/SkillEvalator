import { describe, expect, it } from "vitest";
import { comparisonAdoptionVerdict } from "./comparisonAdoptionVerdict.js";

describe("comparisonAdoptionVerdict", () => {
  it("maps provisional and dry-run to INCONCLUSIVE for export CSV", () => {
    expect(
      comparisonAdoptionVerdict(
        {
          verdict: "INCONCLUSIVE",
          mode: "official",
          adoptionConfirmation: { step: 1, required: 2 },
        },
        "official",
      ),
    ).toBe("INCONCLUSIVE");
    expect(
      comparisonAdoptionVerdict(
        { verdict: "PASS", mode: "dry-run" },
        "dry-run",
      ),
    ).toBe("INCONCLUSIVE");
    expect(
      comparisonAdoptionVerdict(
        {
          verdict: "PASS",
          mode: "official",
          adoptionConfirmation: { step: 1, required: 2 },
        },
        "official",
      ),
    ).toBe("INCONCLUSIVE");
    expect(
      comparisonAdoptionVerdict(
        { verdict: "PASS", mode: "official" },
        "official",
      ),
    ).toBe("PASS");
  });
});
