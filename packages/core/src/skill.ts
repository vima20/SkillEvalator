import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type SkillManifest = {
  taskSetId: string;
  taskIds: string[];
  dryRunIds: string[];
  targetFile: Record<string, string>;
};

export type LoadedSkill = {
  id: string;
  root: string;
  version: string;
  manifest: SkillManifest;
  skillMd: string;
};

function hashDirFiles(root: string): string {
  const hash = crypto.createHash("sha256");
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        hash.update(p);
        hash.update(fs.readFileSync(p));
      }
    }
  };
  walk(root);
  return hash.digest("hex").slice(0, 16);
}

export function loadSkill(skillsDir: string, skillId: string): LoadedSkill {
  const root = path.resolve(skillsDir, skillId);
  if (!fs.existsSync(root)) throw new Error(`Skill not found: ${skillId}`);
  const manifestPath = path.join(root, "fixtures", "manifest.json");
  const skillMdPath = path.join(root, "SKILL.md");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SkillManifest;
  const skillMd = fs.existsSync(skillMdPath)
    ? fs.readFileSync(skillMdPath, "utf8")
    : "";
  return {
    id: skillId,
    root,
    version: hashDirFiles(root),
    manifest,
    skillMd,
  };
}

export function taskIdsForMode(skill: LoadedSkill, mode: "dry-run" | "official"): string[] {
  return mode === "dry-run" ? skill.manifest.dryRunIds : skill.manifest.taskIds;
}

export function taskPaths(skill: LoadedSkill, taskId: string) {
  const taskDir = path.join(skill.root, "fixtures", taskId);
  const target = skill.manifest.targetFile[taskId];
  if (!target) throw new Error(`No targetFile for ${taskId}`);
  return {
    taskDir,
    targetFile: target,
    inputPath: path.join(taskDir, "input", target),
    expectedPath: path.join(taskDir, "expected", target),
    knownGoodPath: path.join(taskDir, "known-good", target),
    knownBadPath: path.join(taskDir, "known-bad", target),
    testsDir: path.join(taskDir, "tests"),
  };
}
