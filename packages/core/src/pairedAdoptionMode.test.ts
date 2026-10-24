import { describe, expect, it } from "vitest";
import { pairedEvaluationAdoptionMode } from "./pairedAdoptionMode.js";

describe("pairedEvaluationAdoptionMode", () => {
  it("prefers official tip legs over stale comparison/meta", () => {
    expect(
      pairedEvaluationAdoptionMode({
        comparisonMode: "dry-run",
        metaMode: "dry-run",
        baselineMode: "official",
        candidateMode: "official",
      }),
    ).toBe("official");
  });

  it("prefers dry-run tip legs over official comparison.json", () => {
    expect(
      pairedEvaluationAdoptionMode({
        comparisonMode: "official",
        baselineMode: "dry-run",
        candidateMode: "dry-run",
      }),
    ).toBe("dry-run");
  });

  it("fail-closes mixed tip leg modes (does not launder stale comparison.json)", () => {
    expect(
      pairedEvaluationAdoptionMode({
        comparisonMode: "official",
        baselineMode: "official",
        candidateMode: "dry-run",
      }),
    ).toBe("dry-run");
  });

  it("falls back to comparison then meta", () => {
    expect(
      pairedEvaluationAdoptionMode({
        comparisonMode: "official",
        metaMode: "dry-run",
      }),
    ).toBe("official");
    expect(
      pairedEvaluationAdoptionMode({
        metaMode: "official",
      }),
    ).toBe("official");
  });
});
