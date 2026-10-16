import { describe, expect, it } from "vitest";
import { unlockHrefFromLocation } from "./apiFetch.js";

describe("unlockHrefFromLocation", () => {
  it("preserves focus=pilot in next=", () => {
    expect(unlockHrefFromLocation("/comparison", "?focus=pilot")).toBe(
      "/unlock?next=%2Fcomparison%3Ffocus%3Dpilot",
    );
    expect(unlockHrefFromLocation("/runs", "")).toBe("/unlock?next=%2Fruns");
    expect(unlockHrefFromLocation("/", "?focus=pilot")).toBe("/unlock");
  });

  it("does not nest unlock redirects", () => {
    expect(unlockHrefFromLocation("/unlock", "?next=/runs")).toBe("/unlock");
  });
});
