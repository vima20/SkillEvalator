import { describe, expect, it } from "vitest";
import { pairedEvaluationAdoptionMode } from "./pairedAdoptionMode.js";

describe("pairedEvaluationAdoptionMode (web client-safe copy)", () => {
  it("matches core tip-leg precedence", () => {
    expect(
      pairedEvaluationAdoptionMode({
        comparisonMode: "dry-run",
        metaMode: "dry-run",
        baselineMode: "official",
        candidateMode: "official",
      }),
    ).toBe("official");
  });
});
