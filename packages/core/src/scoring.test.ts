import { describe, expect, it } from "vitest";
import { NullableUnitScoreSchema, UnitScoreSchema } from "./schema.js";
import {
  aggregateRepeats,
  isUnitScore,
  labelForScore,
  listScorecardTaskIds,
  meanScores,
  scoreSpread,
  taskScorecardCoverageIssues,
  taskScorecardPassCounts,
  unitScoreError,
} from "./scoring.js";

describe("scoring", () => {
  it("UnitScoreSchema rejects NaN / Infinity / out-of-range", () => {
    expect(UnitScoreSchema.parse(0.5)).toBe(0.5);
    expect(NullableUnitScoreSchema.parse(null)).toBeNull();
    expect(() => UnitScoreSchema.parse(Number.NaN)).toThrow();
    expect(() => UnitScoreSchema.parse(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => UnitScoreSchema.parse(Number.NEGATIVE_INFINITY)).toThrow();
    expect(() => UnitScoreSchema.parse(-0.01)).toThrow();
    expect(() => UnitScoreSchema.parse(1.01)).toThrow();
  });

  it("isUnitScore accepts only finite [0, 1]", () => {
    expect(isUnitScore(0)).toBe(true);
    expect(isUnitScore(1)).toBe(true);
    expect(isUnitScore(0.5)).toBe(true);
    expect(isUnitScore(null)).toBe(false);
    expect(isUnitScore(Number.NaN)).toBe(false);
    expect(isUnitScore(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isUnitScore(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isUnitScore(-0.1)).toBe(false);
    expect(isUnitScore(1.1)).toBe(false);
  });

  it("unitScoreError names NaN / Infinity / out-of-range", () => {
    expect(unitScoreError(Number.NaN, "score")).toMatch(/NaN/);
    expect(unitScoreError(Number.POSITIVE_INFINITY, "score")).toMatch(
      /Infinity/,
    );
    expect(unitScoreError(Number.NEGATIVE_INFINITY, "score")).toMatch(
      /-Infinity/,
    );
    expect(unitScoreError(1.5, "score")).toMatch(/\[0, 1\]/);
    expect(unitScoreError(null, "score")).toMatch(/missing/);
  });

  it("means scores (null skipped; invalid throws)", () => {
    expect(meanScores([1, 0, 1])).toBeCloseTo(2 / 3);
    expect(meanScores([null, 1])).toBe(1);
    expect(meanScores([null])).toBeNull();
    expect(() => meanScores([Number.NaN, 1])).toThrow(/NaN/);
    expect(() => meanScores([1.5])).toThrow(/\[0, 1\]/);
  });

  it("spread", () => {
    expect(scoreSpread([1, 1, 1])).toBe(0);
    expect(scoreSpread([0, 1])).toBeCloseTo(0.5);
    expect(() => scoreSpread([Number.POSITIVE_INFINITY])).toThrow(/Infinity/);
  });

  it("labels", () => {
    expect(labelForScore(1)).toBe("Pass");
    expect(labelForScore(1, 0)).toBe("Strong");
    expect(labelForScore(1, { scoreSpread: 0, meanDiffRatio: 0 })).toBe(
      "Strong",
    );
    expect(labelForScore(1, { scoreSpread: 0, meanDiffRatio: 0.5 })).toBe(
      "Pass",
    );
    expect(labelForScore(1, 0.2)).toBe("Pass");
    expect(labelForScore(0.85)).toBe("Pass");
    expect(labelForScore(0.5)).toBe("Fail");
    expect(labelForScore(0)).toBe("Fail");
    expect(labelForScore(null)).toBe("Fail");
    expect(labelForScore(Number.NaN)).toBe("Fail");
    expect(labelForScore(Number.POSITIVE_INFINITY)).toBe("Fail");
  });

  it("aggregates repeats without coercing empty to 0", () => {
    const a = aggregateRepeats([1, 0, 1]);
    expect(a.score).toBeCloseTo(2 / 3);
    expect(a.scoreSpread).toBeGreaterThan(0);
    expect(aggregateRepeats([]).score).toBeNull();
    expect(() => aggregateRepeats([Number.NaN])).toThrow(/NaN/);
  });

  it("taskScorecardCoverageIssues rejects empty/partial/duplicate scorecards", () => {
    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: 1 }],
      ),
    ).toEqual([]);

    expect(
      taskScorecardCoverageIssues(["bug-01"], []),
    ).toEqual(["perTask missing taskId(s): bug-01"]);

    expect(taskScorecardCoverageIssues([], [])).toEqual([
      "taskIds is empty",
    ]);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [
          { taskId: "bug-01", score: 1 },
          { taskId: "bug-01", score: 0.5 },
        ],
      ),
    ).toEqual(["perTask duplicate taskId(s): bug-01"]);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: null }],
        { requireFiniteScores: true, label: "candidate" },
      ),
    ).toEqual([
      "candidate perTask[bug-01] score is missing",
      "candidate run score is missing",
    ]);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: 0.5 }],
        { requireFiniteScores: true, runScore: 1 },
      ),
    ).toEqual(["run score 1.000 ≠ perTask mean 0.500"]);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01", "bug-02"],
        [
          { taskId: "bug-01", score: 1 },
          { taskId: "bug-02", score: 0.8 },
        ],
        { requireFiniteScores: true, runScore: 0.9 },
      ),
    ).toEqual([]);
  });

  it("taskScorecardCoverageIssues rejects NaN / out-of-range scores", () => {
    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: Number.NaN }],
        { requireFiniteScores: true, runScore: 1 },
      ).some((i) => /NaN/.test(i)),
    ).toBe(true);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: 1 }],
        { requireFiniteScores: true, runScore: Number.POSITIVE_INFINITY },
      ).some((i) => /Infinity/.test(i)),
    ).toBe(true);

    expect(
      taskScorecardCoverageIssues(
        ["bug-01"],
        [{ taskId: "bug-01", score: 1.5 }],
      ).some((i) => /\[0, 1\]/.test(i)),
    ).toBe(true);
  });

  it("taskScorecardPassCounts uses taskIds (missing ≠ passed)", () => {
    expect(
      taskScorecardPassCounts(
        ["bug-01", "bug-02"],
        [{ taskId: "bug-01", score: 1 }],
      ),
    ).toEqual({
      passed: 1,
      total: 2,
      failedTaskIds: ["bug-02"],
    });
    expect(
      listScorecardTaskIds(
        ["bug-01", "bug-02"],
        [{ taskId: "bug-01" }, { taskId: "extra" }],
      ),
    ).toEqual(["bug-01", "bug-02", "extra"]);
  });
});
