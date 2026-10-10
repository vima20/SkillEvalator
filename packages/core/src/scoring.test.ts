import { describe, expect, it } from "vitest";
import { aggregateRepeats, labelForScore, meanScores, scoreSpread } from "./scoring.js";

describe("scoring", () => {
  it("means scores", () => {
    expect(meanScores([1, 0, 1])).toBeCloseTo(2 / 3);
    expect(meanScores([null, 1])).toBe(1);
    expect(meanScores([null])).toBeNull();
  });

  it("spread", () => {
    expect(scoreSpread([1, 1, 1])).toBe(0);
    expect(scoreSpread([0, 1])).toBeCloseTo(0.5);
  });

  it("labels", () => {
    expect(labelForScore(1)).toBe("Pass");
    expect(labelForScore(1, 0)).toBe("Strong");
    expect(labelForScore(1, 0.2)).toBe("Pass");
    expect(labelForScore(0)).toBe("Fail");
    expect(labelForScore(null)).toBe("Fail");
  });

  it("aggregates repeats", () => {
    const a = aggregateRepeats([1, 0, 1]);
    expect(a.score).toBeCloseTo(2 / 3);
    expect(a.scoreSpread).toBeGreaterThan(0);
  });
});
