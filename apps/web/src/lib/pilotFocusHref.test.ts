import { describe, expect, it } from "vitest";
import {
  isOfficialModeParam,
  isPilotFocusParam,
  withNewRunHandoff,
  withPilotFocus,
} from "./pilotFocusHref.js";

describe("pilotFocusHref", () => {
  it("detects focus=pilot", () => {
    expect(isPilotFocusParam("pilot")).toBe(true);
    expect(isPilotFocusParam(undefined)).toBe(false);
    expect(isPilotFocusParam(["pilot"])).toBe(true);
  });

  it("detects mode=official", () => {
    expect(isOfficialModeParam("official")).toBe(true);
    expect(isOfficialModeParam("dry-run")).toBe(false);
    expect(isOfficialModeParam(undefined)).toBe(false);
    expect(isOfficialModeParam(["official"])).toBe(true);
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

  it("new-run handoff keeps dry-run default and pins official", () => {
    expect(withNewRunHandoff(false, false)).toBe("/");
    expect(withNewRunHandoff(true, false)).toBe("/?focus=pilot");
    expect(withNewRunHandoff(false, true)).toBe("/?mode=official");
    expect(withNewRunHandoff(true, true)).toBe(
      "/?mode=official&focus=pilot",
    );
  });
});
