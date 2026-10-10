import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readJsonFileAs } from "./fsJson.js";
import { assertSafeId, resolveUnder } from "./paths.js";
import { SkillManifestSchema, type SkillManifest } from "./schema.js";

export type { SkillManifest };

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
  const id = assertSafeId(skillId, "evalSkillId");
  const root = resolveUnder(skillsDir, id);
  if (!fs.existsSync(root)) throw new Error(`Skill not found: ${id}`);
  const manifestPath = path.join(root, "fixtures", "manifest.json");
  const skillMdPath = path.join(root, "SKILL.md");
  const manifest = readJsonFileAs(SkillManifestSchema, manifestPath);
  for (const taskId of manifest.taskIds) {
    if (!manifest.targetFile[taskId]) {
      throw new Error(`manifest targetFile missing for ${taskId}`);
    }
  }
  for (const taskId of manifest.dryRunIds) {
    if (!manifest.taskIds.includes(taskId)) {
      throw new Error(`dryRunId not in taskIds: ${taskId}`);
    }
  }
  const skillMd = fs.existsSync(skillMdPath)
    ? fs.readFileSync(skillMdPath, "utf8")
    : "";
  return {
    id,
    root,
    version: hashDirFiles(root),
    manifest,
    skillMd,
  };
}

export function taskIdsForMode(
  skill: LoadedSkill,
  mode: "dry-run" | "official",
): string[] {
  return mode === "dry-run" ? skill.manifest.dryRunIds : skill.manifest.taskIds;
}

export function taskPaths(skill: LoadedSkill, taskId: string) {
  const safeTask = assertSafeId(taskId, "taskId");
  const taskDir = resolveUnder(skill.root, "fixtures", safeTask);
  const target = skill.manifest.targetFile[safeTask];
  if (!target) throw new Error(`No targetFile for ${safeTask}`);
  if (target.includes("..") || /[\\/]/.test(target)) {
    throw new Error(`invalid targetFile for ${safeTask}`);
  }
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
