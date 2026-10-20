import { describe, expect, it } from "vitest";
import {
  aggregateRepeats,
  labelForScore,
  listScorecardTaskIds,
  meanScores,
  scoreSpread,
  taskScorecardCoverageIssues,
  taskScorecardPassCounts,
} from "./scoring.js";

describe("scoring", () => {
  it("means scores", () => {
    expect(meanScores([1, 0, 1])).toBeCloseTo(2 / 3);
    expect(meanScores([null, 1])).toBe(1);
    expect(meanScores([null])).toBeNull();
    expect(meanScores([Number.NaN, 1])).toBe(1);
  });

  it("spread", () => {
    expect(scoreSpread([1, 1, 1])).toBe(0);
    expect(scoreSpread([0, 1])).toBeCloseTo(0.5);
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
  });

  it("aggregates repeats", () => {
    const a = aggregateRepeats([1, 0, 1]);
    expect(a.score).toBeCloseTo(2 / 3);
    expect(a.scoreSpread).toBeGreaterThan(0);
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
      "candidate perTask[bug-01] score is missing or non-finite",
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
