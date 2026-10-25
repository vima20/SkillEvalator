import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyAgentSkillHarness,
  findAgentSkillRoots,
  resolveAgentSkillHarnessTemplate,
} from "./agentSkillWrap.js";
import { findRepoRoot } from "./paths.js";

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function mkTemp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

describe("findAgentSkillRoots", () => {
  it("finds SKILL.md folders without manifest", () => {
    const root = mkTemp("se-agent-find-");
    const skill = path.join(root, "net-skill");
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "# from the internet\n", "utf8");
    expect(findAgentSkillRoots(root)).toEqual([skill]);
  });

  it("skips eval packages that already have manifest", () => {
    const root = mkTemp("se-agent-skip-");
    const evalSkill = path.join(root, "full-eval");
    fs.mkdirSync(path.join(evalSkill, "fixtures"), { recursive: true });
    fs.writeFileSync(
      path.join(evalSkill, "fixtures", "manifest.json"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(path.join(evalSkill, "SKILL.md"), "# x\n", "utf8");
    expect(findAgentSkillRoots(root)).toEqual([]);
  });
});

describe("applyAgentSkillHarness", () => {
  it("installs cde-v1 manifest and grade.js", () => {
    const repo = findRepoRoot(process.cwd());
    const evalSkills = path.join(repo, "eval-skills");
    const template = resolveAgentSkillHarnessTemplate([evalSkills]);
    const dest = mkTemp("se-agent-wrap-");
    fs.writeFileSync(path.join(dest, "SKILL.md"), "# wrapped\n", "utf8");
    applyAgentSkillHarness(dest, {
      harnessTemplateDir: template,
      githubUrl: "https://github.com/acme/skills/tree/main/net-skill",
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dest, "fixtures", "manifest.json"), "utf8"),
    ) as { taskSetDir: string; taskIds: string[] };
    expect(manifest.taskSetDir).toBe("cde-v1");
    expect(manifest.taskIds).toContain("bug-01");
    expect(fs.existsSync(path.join(dest, "scripts", "grade.js"))).toBe(true);
  });
});
