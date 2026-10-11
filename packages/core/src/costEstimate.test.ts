import { describe, expect, it } from "vitest";
import { estimateCallCostUsd, estimateRunCostUsd } from "./costEstimate.js";

describe("estimateRunCostUsd", () => {
  it("scales with tasks and repeats", () => {
    const one = estimateRunCostUsd({
      taskCount: 1,
      repeats: 1,
      modelId: "gpt-4o-mini",
    });
    const many = estimateRunCostUsd({
      taskCount: 3,
      repeats: 2,
      modelId: "gpt-4o-mini",
    });
    expect(one.calls).toBe(1);
    expect(many.calls).toBe(6);
    expect(many.estimatedUsd).toBe(
      Math.round(one.perCallUsd * 6 * 10_000) / 10_000,
    );
  });

  it("prices official model higher than dry-run default", () => {
    expect(estimateCallCostUsd("gpt-4.1-mini")).toBeGreaterThan(
      estimateCallCostUsd("gpt-4o-mini"),
    );
  });
});
