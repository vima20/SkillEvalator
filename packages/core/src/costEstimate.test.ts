import { describe, expect, it } from "vitest";
import {
  costFromTokenUsage,
  estimateCallCostUsd,
  estimateRunCostUsd,
} from "./costEstimate.js";

describe("costFromTokenUsage", () => {
  it("prices gpt-4.1-mini higher than gpt-4o-mini for same tokens", () => {
    const mini = costFromTokenUsage("gpt-4o-mini", 1000, 500);
    const official = costFromTokenUsage("gpt-4.1-mini", 1000, 500);
    expect(official).toBeGreaterThan(mini);
    expect(mini).toBeCloseTo((1000 * 0.15 + 500 * 0.6) / 1_000_000, 8);
    expect(official).toBeCloseTo((1000 * 0.4 + 500 * 1.6) / 1_000_000, 8);
  });

  it("falls back to mini rates for unknown models", () => {
    expect(costFromTokenUsage("unknown-model", 1000, 0)).toBe(
      costFromTokenUsage("gpt-4o-mini", 1000, 0),
    );
  });
});

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
