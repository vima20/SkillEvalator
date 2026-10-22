import { describe, expect, it } from "vitest";
import { pairedEvaluationAdoptionMode as corePairedAdoptionMode } from "@skillevalator/core/pairedAdoptionMode";
import { pairedEvaluationAdoptionMode } from "./pairedAdoptionMode.js";

const fixtures = [
  {
    comparisonMode: "dry-run" as const,
    metaMode: "dry-run",
    baselineMode: "official" as const,
    candidateMode: "official" as const,
  },
  {
    comparisonMode: "official" as const,
    baselineMode: "dry-run" as const,
    candidateMode: "dry-run" as const,
  },
  {
    comparisonMode: "official" as const,
    metaMode: "dry-run",
  },
  { metaMode: "official" },
];

describe("pairedEvaluationAdoptionMode (web client-safe copy)", () => {
  it("stays in sync with @skillevalator/core/pairedAdoptionMode", () => {
    for (const opts of fixtures) {
      expect(pairedEvaluationAdoptionMode(opts)).toBe(
        corePairedAdoptionMode(opts),
      );
    }
  });
});
