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
  /** Directory that contains per-task folders (bug-01, …). */
  fixturesRoot: string;
  version: string;
  manifest: SkillManifest;
  skillMd: string;
};

const SKIP_SKILL_DIRS = new Set(["tasksets", "node_modules"]);

function hashDirFiles(root: string): string {
  const hash = crypto.createHash("sha256");
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) {
        hash.update(path.relative(root, p).split(path.sep).join("/"));
        hash.update(fs.readFileSync(p));
      }
    }
  };
  walk(root);
  return hash.digest("hex").slice(0, 16);
}

function resolveFixturesRoot(
  skillsDir: string,
  skillRoot: string,
  manifest: SkillManifest,
): string {
  if (manifest.taskSetDir) {
    const shared = resolveUnder(skillsDir, "tasksets", manifest.taskSetDir);
    if (!fs.existsSync(shared)) {
      throw new Error(`shared task set not found: tasksets/${manifest.taskSetDir}`);
    }
    return shared;
  }
  return path.join(skillRoot, "fixtures");
}

function loadSkillFromRoot(skillsDir: string, skillId: string): LoadedSkill {
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
  const fixturesRoot = resolveFixturesRoot(skillsDir, root, manifest);
  for (const taskId of manifest.taskIds) {
    const safe = assertSafeId(taskId, "taskId");
    if (!fs.existsSync(resolveUnder(fixturesRoot, safe))) {
      throw new Error(`task fixtures missing: ${safe}`);
    }
  }
  const skillMd = fs.existsSync(skillMdPath)
    ? fs.readFileSync(skillMdPath, "utf8")
    : "";
  const version = crypto
    .createHash("sha256")
    .update(hashDirFiles(root))
    .update(hashDirFiles(fixturesRoot))
    .digest("hex")
    .slice(0, 16);
  return {
    id,
    root,
    fixturesRoot,
    version,
    manifest,
    skillMd,
  };
}

/** Load a skill from one directory or the first match across several roots. */
export function loadSkill(
  skillsDir: string | string[],
  skillId: string,
): LoadedSkill {
  const dirs = Array.isArray(skillsDir) ? skillsDir : [skillsDir];
  const id = assertSafeId(skillId, "evalSkillId");
  const errors: string[] = [];
  for (const dir of dirs) {
    try {
      return loadSkillFromRoot(dir, id);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors[0] ?? `Skill not found: ${id}`);
}

export type SkillSummary = {
  id: string;
  githubUrl: string;
  taskSetId: string;
  dryRunCount: number;
  taskCount: number;
};

/** List eval skills that have a valid fixtures/manifest.json. */
export function listSkills(skillsDir: string | string[]): SkillSummary[] {
  const dirs = Array.isArray(skillsDir) ? skillsDir : [skillsDir];
  const seen = new Set<string>();
  const out: SkillSummary[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (SKIP_SKILL_DIRS.has(name) || seen.has(name)) continue;
      try {
        const skill = loadSkillFromRoot(dir, name);
        seen.add(name);
        out.push({
          id: skill.id,
          githubUrl: skill.manifest.githubUrl,
          taskSetId: skill.manifest.taskSetId,
          dryRunCount: skill.manifest.dryRunIds.length,
          taskCount: skill.manifest.taskIds.length,
        });
      } catch {
        /* skip non-skill dirs / invalid manifests */
      }
    }
  }
  return out;
}

export function taskIdsForMode(
  skill: LoadedSkill,
  mode: "dry-run" | "official",
): string[] {
  return mode === "dry-run" ? skill.manifest.dryRunIds : skill.manifest.taskIds;
}

export function taskPaths(skill: LoadedSkill, taskId: string) {
  const safeTask = assertSafeId(taskId, "taskId");
  const taskDir = resolveUnder(skill.fixturesRoot, safeTask);
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
    /** Optional module-under-test files for skills like test-generation-eval. */
    subjectDir: path.join(taskDir, "subject"),
  };
}
