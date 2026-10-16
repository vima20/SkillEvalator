import { describe, expect, it } from "vitest";
import { DEFAULT_COST_CAP_USD, parseCostCapUsd } from "./models.js";

describe("parseCostCapUsd", () => {
  it("parses positive finite values", () => {
    expect(parseCostCapUsd("2.5")).toBe(2.5);
    expect(parseCostCapUsd("10")).toBe(10);
  });

  it("falls back for missing or invalid values", () => {
    expect(parseCostCapUsd(undefined)).toBe(DEFAULT_COST_CAP_USD);
    expect(parseCostCapUsd("")).toBe(DEFAULT_COST_CAP_USD);
    expect(parseCostCapUsd("0")).toBe(DEFAULT_COST_CAP_USD);
    expect(parseCostCapUsd("-1")).toBe(DEFAULT_COST_CAP_USD);
    expect(parseCostCapUsd("nope")).toBe(DEFAULT_COST_CAP_USD);
  });
});
