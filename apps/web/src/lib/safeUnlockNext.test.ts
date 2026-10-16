import { describe, expect, it } from "vitest";
import { safeUnlockNext, unlockNextFromRequest } from "./safeUnlockNext.js";

describe("safeUnlockNext", () => {
  it("keeps relative paths and focus=pilot", () => {
    expect(safeUnlockNext("/comparison")).toBe("/comparison");
    expect(safeUnlockNext("/comparison?focus=pilot")).toBe(
      "/comparison?focus=pilot",
    );
    expect(safeUnlockNext("/benefit/run_1?x=1&focus=pilot")).toBe(
      "/benefit/run_1?focus=pilot",
    );
  });

  it("rejects open redirects and unlock loops", () => {
    expect(safeUnlockNext("https://evil.example/")).toBe("/");
    expect(safeUnlockNext("//evil.example")).toBe("/");
    expect(safeUnlockNext("/unlock")).toBe("/");
    expect(safeUnlockNext("/../etc/passwd")).toBe("/");
    expect(safeUnlockNext(null)).toBe("/");
  });
});

describe("unlockNextFromRequest", () => {
  it("preserves focus=pilot from the blocked URL", () => {
    expect(
      unlockNextFromRequest("/runs", { get: () => "pilot" }),
    ).toBe("/runs?focus=pilot");
    expect(
      unlockNextFromRequest("/runs", { get: () => null }),
    ).toBe("/runs");
    expect(
      unlockNextFromRequest("/", { get: () => "pilot" }),
    ).toBeNull();
  });
});
