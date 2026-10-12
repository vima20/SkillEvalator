import { describe, expect, it } from "vitest";
import {
  COST_PRECHECK_SAFETY,
  costFromTokenUsage,
  estimateCallCostUsd,
  estimateCallCostUsdForCap,
  estimateMaxCallCostUsd,
  estimateRunCostUsd,
  estimateTokensFromText,
  maxOutputTokensForRemainingBudget,
  wouldExceedCostCap,
} from "./costEstimate.js";

describe("wouldExceedCostCap", () => {
  it("blocks when spent already at cap", () => {
    expect(
      wouldExceedCostCap({ spentUsd: 5, nextCallUsd: 0.01, capUsd: 5 }),
    ).toBe(true);
  });

  it("blocks when projected spend would pass cap", () => {
    expect(
      wouldExceedCostCap({ spentUsd: 4.9, nextCallUsd: 0.2, capUsd: 5 }),
    ).toBe(true);
  });

  it("allows when projected spend stays within cap", () => {
    expect(
      wouldExceedCostCap({ spentUsd: 0.01, nextCallUsd: 0.01, capUsd: 5 }),
    ).toBe(false);
  });
});

describe("costFromTokenUsage", () => {
  it("prices gpt-4.1-mini higher than gpt-4o-mini for same tokens", () => {
    const mini = costFromTokenUsage("gpt-4o-mini", 1000, 500);
    const official = costFromTokenUsage("gpt-4.1-mini", 1000, 500);
    expect(official).toBeGreaterThan(mini);
    expect(mini).toBeCloseTo((1000 * 0.15 + 500 * 0.6) / 1_000_000, 8);
    expect(official).toBeCloseTo((1000 * 0.4 + 500 * 1.6) / 1_000_000, 8);
  });

  it("falls back to the most expensive known rate for unknown models", () => {
    expect(costFromTokenUsage("unknown-model", 1000, 0)).toBe(
      costFromTokenUsage("gpt-4.1-mini", 1000, 0),
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

describe("estimateCallCostUsdForCap", () => {
  it("inflates the UI estimate by the safety factor", () => {
    const base = estimateCallCostUsd("gpt-4o-mini");
    expect(estimateCallCostUsdForCap("gpt-4o-mini")).toBeCloseTo(
      base * COST_PRECHECK_SAFETY,
      10,
    );
  });

  it("raises the pre-check when max_tokens worst-case dominates", () => {
    const without = estimateCallCostUsdForCap("gpt-4o-mini");
    const withMax = estimateCallCostUsdForCap("gpt-4o-mini", 16_000);
    expect(withMax).toBeGreaterThan(without);
    expect(withMax).toBeCloseTo(
      estimateMaxCallCostUsd("gpt-4o-mini", 16_000),
      10,
    );
  });
});

describe("maxOutputTokensForRemainingBudget", () => {
  it("returns 0 when remaining cannot cover assumed input", () => {
    expect(
      maxOutputTokensForRemainingBudget({
        modelId: "gpt-4o-mini",
        remainingUsd: 0.0001,
        maxOutputTokens: 4000,
        estimatedInputTokens: 12_000,
      }),
    ).toBe(0);
  });

  it("clamps below the configured max when budget is tight", () => {
    // gpt-4o-mini output $0.6/MTok → $0.001 buys ~1666 completion tokens
    // after ~1000 input tokens (~$0.00015).
    const clamped = maxOutputTokensForRemainingBudget({
      modelId: "gpt-4o-mini",
      remainingUsd: 0.001,
      maxOutputTokens: 16_000,
      estimatedInputTokens: 1000,
    });
    expect(clamped).toBeGreaterThan(0);
    expect(clamped).toBeLessThan(16_000);
  });

  it("estimateTokensFromText scales with length", () => {
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("a".repeat(40))).toBe(10);
  });
});
