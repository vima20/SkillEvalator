import { describe, expect, it } from "vitest";
import {
  goldenTaskPassCounts,
  taskGoldenQuality,
} from "./scorecardGolden.js";

describe("taskGoldenQuality", () => {
  it("classifies golden vs soft vs missing", () => {
    expect(taskGoldenQuality({ score: 1, diffRatio: 0 })).toBe("golden");
    expect(taskGoldenQuality({ score: 0.995, diffRatio: 0.02 })).toBe(
      "golden",
    );
    expect(taskGoldenQuality({ score: 0.9, diffRatio: 0 })).toBe("soft_pass");
    expect(taskGoldenQuality({ score: 1, diffRatio: 0.2 })).toBe("soft_pass");
    expect(taskGoldenQuality({ score: 0.5 })).toBe("below_soft");
    expect(taskGoldenQuality({ score: null })).toBe("missing");
  });
});

describe("goldenTaskPassCounts", () => {
  it("counts golden tasks on declared taskIds", () => {
    const out = goldenTaskPassCounts(["a", "b"], [
      { taskId: "a", score: 1, diffRatio: 0 },
      { taskId: "b", score: 0.85 },
    ]);
    expect(out).toEqual({ goldenPassed: 1, softPassed: 1, total: 2 });
  });
});
