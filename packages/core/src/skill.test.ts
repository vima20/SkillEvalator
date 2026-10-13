import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonFile } from "./fsJson.js";
import { loadSkill, tryProvisionalSkillPin } from "./skill.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function writeMinimalSkill(skillsDir: string, id: string): void {
  const root = path.join(skillsDir, id);
  writeJsonFile(path.join(root, "fixtures", "manifest.json"), {
    taskSetId: "t-v1",
    githubUrl: "https://github.com/acme/skills",
    license: "MIT",
    dependencies: [],
    taskIds: ["bug-01"],
    dryRunIds: ["bug-01"],
    targetFile: { "bug-01": "fix.js" },
  });
  fs.mkdirSync(path.join(root, "fixtures", "bug-01"), { recursive: true });
  fs.writeFileSync(path.join(root, "SKILL.md"), "# skill\n", "utf8");
}

describe("tryProvisionalSkillPin", () => {
  it("pins SKILL.md + version without requiring every task fixture", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prov-"));
    temps.push(root);
    writeMinimalSkill(root, "code-debugging-eval");
    // Remove task fixture — full loadSkill would fail; provisional still pins.
    fs.rmSync(path.join(root, "code-debugging-eval", "fixtures", "bug-01"), {
      recursive: true,
      force: true,
    });
    expect(() => loadSkill(root, "code-debugging-eval")).toThrow(
      /task fixtures missing/,
    );
    const pin = tryProvisionalSkillPin(root, "code-debugging-eval");
    expect(pin).not.toBeNull();
    expect(pin!.id).toBe("code-debugging-eval");
    expect(pin!.skillMd).toContain("# skill");
    expect(pin!.version).toMatch(/^[0-9a-f]{16}$/);
    expect(pin!.manifest.taskSetId).toBe("t-v1");
  });

  it("returns null for missing skills", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-prov-miss-"));
    temps.push(root);
    expect(tryProvisionalSkillPin(root, "no-such-skill")).toBeNull();
  });
});

describe("loadSkill SKILL.md", () => {
  it("rejects symlink SKILL.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-skill-sym-"));
    temps.push(root);
    writeMinimalSkill(root, "code-debugging-eval");
    const skillRoot = path.join(root, "code-debugging-eval");
    const md = path.join(skillRoot, "SKILL.md");
    const secret = path.join(root, "secret.env");
    fs.writeFileSync(secret, "SECRET=1\n", "utf8");
    fs.unlinkSync(md);
    try {
      fs.symlinkSync(secret, md);
    } catch {
      // Windows without Developer Mode / admin may block symlinks.
      return;
    }
    expect(() => loadSkill(root, "code-debugging-eval")).toThrow(/symlink/i);
  });

  it("reads a regular SKILL.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-skill-ok-"));
    temps.push(root);
    writeMinimalSkill(root, "code-debugging-eval");
    const loaded = loadSkill(root, "code-debugging-eval");
    expect(loaded.skillMd).toContain("# skill");
  });

  it("rejects a fixtures directory symlink", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-skill-dirsym-"));
    temps.push(root);
    writeMinimalSkill(root, "code-debugging-eval");
    const skillRoot = path.join(root, "code-debugging-eval");
    const fixtures = path.join(skillRoot, "fixtures");
    const host = path.join(root, "host-fixtures");
    fs.renameSync(fixtures, host);
    try {
      fs.symlinkSync(host, fixtures, "dir");
    } catch {
      return;
    }
    expect(() => loadSkill(root, "code-debugging-eval")).toThrow(/symlink/i);
  });
});
