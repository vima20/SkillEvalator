import { describe, expect, it } from "vitest";
import { isPilotFocusParam, withPilotFocus } from "./pilotFocusHref.js";

describe("pilotFocusHref", () => {
  it("detects focus=pilot", () => {
    expect(isPilotFocusParam("pilot")).toBe(true);
    expect(isPilotFocusParam(undefined)).toBe(false);
    expect(isPilotFocusParam(["pilot"])).toBe(true);
  });

  it("appends focus only when requested", () => {
    expect(withPilotFocus("/comparison/eval_1", false)).toBe(
      "/comparison/eval_1",
    );
    expect(withPilotFocus("/comparison/eval_1", true)).toBe(
      "/comparison/eval_1?focus=pilot",
    );
    expect(withPilotFocus("/benefit/run_1?x=1", true)).toBe(
      "/benefit/run_1?x=1&focus=pilot",
    );
  });
});
