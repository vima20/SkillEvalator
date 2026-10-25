import fs from "node:fs";
import path from "node:path";
import { readRegularFileUtf8 } from "./fsSafe.js";
import { writeJsonFile } from "./fsJson.js";
import type { SkillManifest } from "./schema.js";

/** Default task family when wrapping net / Agent skills (SKILL.md only). Keep in sync with code-debugging-eval. */
export const AGENT_SKILL_WRAP_TASK_SET_ID = "cde-v1";

const WRAP_MANIFEST_BODY: Omit<SkillManifest, "githubUrl" | "commit"> = {
  taskSetId: AGENT_SKILL_WRAP_TASK_SET_ID,
  taskSetDir: AGENT_SKILL_WRAP_TASK_SET_ID,
  license: "UNLICENSED",
  dependencies: ["node"],
  taskIds: [
    "bug-01",
    "bug-02",
    "bug-03",
    "bug-04",
    "bug-05",
    "bug-06",
    "bug-07",
    "bug-08",
  ],
  dryRunIds: ["bug-01", "bug-03", "bug-08"],
  targetFile: {
    "bug-01": "sum.js",
    "bug-02": "auth.js",
    "bug-03": "user.js",
    "bug-04": "fetchUser.js",
    "bug-05": "cart.js",
    "bug-06": "parse.js",
    "bug-07": "counter.js",
    "bug-08": "safePath.js",
  },
};

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "fixtures",
  "tasksets",
  "input",
  "expected",
  "known-good",
  "known-bad",
  "tests",
  "subject",
  "subject-bad",
]);

function skillMdLooksValid(skillMdPath: string): boolean {
  if (!fs.existsSync(skillMdPath)) return false;
  try {
    const body = readRegularFileUtf8(skillMdPath, "SKILL.md");
    return body.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Directories with SKILL.md but no eval manifest — typical Agent / Cursor skills.
 */
export function findAgentSkillRoots(
  root: string,
  maxDepth = 8,
  maxSkills = 30,
): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (found.length >= maxSkills) return;
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const manifestPath = path.join(dir, "fixtures", "manifest.json");
    if (fs.existsSync(manifestPath)) {
      return;
    }
    const skillMdPath = path.join(dir, "SKILL.md");
    if (skillMdLooksValid(skillMdPath)) {
      found.push(dir);
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** Bundled code-debugging-eval harness (grade.js) for wrapped imports. */
export function resolveAgentSkillHarnessTemplate(
  tasksetSearchDirs: string[],
): string {
  for (const dir of tasksetSearchDirs) {
    const candidate = path.join(dir, "code-debugging-eval");
    const gradeJs = path.join(candidate, "scripts", "grade.js");
    if (fs.existsSync(gradeJs)) {
      return candidate;
    }
  }
  throw new Error(
    "Agent skill import needs eval-skills/code-debugging-eval on disk (cde-v1 harness)",
  );
}

/** Install fixtures/manifest.json + grade.js after copying a plain SKILL.md tree. */
export function applyAgentSkillHarness(
  skillDestDir: string,
  opts: {
    harnessTemplateDir: string;
    githubUrl: string;
    commit?: string;
  },
): void {
  const fixturesDir = path.join(skillDestDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });
  writeJsonFile(path.join(fixturesDir, "manifest.json"), {
    ...WRAP_MANIFEST_BODY,
    githubUrl: opts.githubUrl,
    ...(opts.commit ? { commit: opts.commit } : {}),
  });

  const scriptsDir = path.join(skillDestDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const gradeSrc = path.join(opts.harnessTemplateDir, "scripts", "grade.js");
  const gradeDest = path.join(scriptsDir, "grade.js");
  fs.writeFileSync(
    gradeDest,
    readRegularFileUtf8(gradeSrc, "grade.js"),
    "utf8",
  );
}
