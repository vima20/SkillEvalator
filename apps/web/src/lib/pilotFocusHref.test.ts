import { describe, expect, it } from "vitest";
import {
  isOfficialModeParam,
  isPilotFocusParam,
  pairedEvalDisplayMode,
  listNewRunHref,
  pairedEvalPreferOfficial,
  withNewRunHandoff,
  withPilotFocus,
} from "./pilotFocusHref.js";

describe("pilotFocusHref", () => {
  it("does not import @skillevalator/core barrel (avoids client child_process bundle)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/pilotFocusHref.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from "@skillevalator\/core"/);
    expect(src).toMatch(/@\/lib\/pairedAdoptionMode/);
  });

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

  it("pairedEvalDisplayMode lets tip legs override stale meta mode", () => {
    expect(
      pairedEvalDisplayMode({
        metaMode: "dry-run",
        baselineMode: "official",
        candidateMode: "official",
      }),
    ).toBe("official");
    expect(
      pairedEvalDisplayMode({
        metaMode: "official",
        baselineMode: "dry-run",
        candidateMode: "dry-run",
      }),
    ).toBe("dry-run");
    expect(
      pairedEvalDisplayMode({
        metaMode: "official",
        baselineMode: undefined,
        candidateMode: undefined,
      }),
    ).toBe("official");
    expect(
      pairedEvalPreferOfficial({
        metaMode: "official",
        baselineMode: "dry-run",
        candidateMode: "dry-run",
      }),
    ).toBe(false);
  });

  it("listNewRunHref adds official mode when pilot focus is on", () => {
    expect(listNewRunHref(false)).toBe("/");
    expect(listNewRunHref(true)).toBe("/?mode=official&focus=pilot");
  });

  it("list pages wire listNewRunHref for header New run", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    for (const rel of [
      "src/app/dashboard/page.tsx",
      "src/app/runs/page.tsx",
      "src/app/benefit/page.tsx",
      "src/app/comparison/page.tsx",
    ]) {
      const src = fs.readFileSync(path.join(cwd, rel), "utf8");
      expect(src).toMatch(/listNewRunHref\(pilotFocus\)/);
    }
  });

  it("Nav and brand use listNewRunHref for New run home", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    expect(
      fs.readFileSync(path.join(cwd, "src/components/Nav.tsx"), "utf8"),
    ).toMatch(/item\.href === "\/"/);
    expect(
      fs.readFileSync(path.join(cwd, "src/components/Nav.tsx"), "utf8"),
    ).toMatch(/listNewRunHref\(pilotFocus\)/);
    expect(
      fs.readFileSync(path.join(cwd, "src/components/BrandLink.tsx"), "utf8"),
    ).toMatch(/listNewRunHref\(pilotFocus\)/);
  });

  it("empty-skills New run surfaces ?mode=official until skills exist", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/Official mode requested/);
    expect(page).toMatch(/preferOfficial \? \(/);
    expect(page).toMatch(/\?mode=official/);
  });
});
