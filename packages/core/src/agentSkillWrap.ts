import fs from "node:fs";
import path from "node:path";
import { readRegularFileUtf8 } from "./fsSafe.js";
import { writeJsonFile } from "./fsJson.js";
import type { SkillManifest } from "./schema.js";

/** Task family used when wrapping plain SKILL.md imports. */
export type AgentSkillWrapProfile = "cde-v1" | "tge-v1";

export const AGENT_SKILL_WRAP_PROFILES: AgentSkillWrapProfile[] = [
  "cde-v1",
  "tge-v1",
];

/** Default wrap profile (MVP code debugging). */
export const AGENT_SKILL_WRAP_TASK_SET_ID: AgentSkillWrapProfile = "cde-v1";

const WRAP_MANIFEST_CDE: Omit<SkillManifest, "githubUrl" | "commit"> = {
  taskSetId: "cde-v1",
  taskSetDir: "cde-v1",
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

const WRAP_MANIFEST_TGE: Omit<SkillManifest, "githubUrl" | "commit"> = {
  taskSetId: "tge-v1",
  license: "UNLICENSED",
  dependencies: ["node"],
  taskIds: ["gen-01", "gen-02", "gen-03", "gen-04", "gen-05", "gen-06"],
  dryRunIds: ["gen-01", "gen-02", "gen-03"],
  targetFile: {
    "gen-01": "test.js",
    "gen-02": "test.js",
    "gen-03": "test.js",
    "gen-04": "test.js",
    "gen-05": "test.js",
    "gen-06": "test.js",
  },
};

const PROFILE_CONFIG: Record<
  AgentSkillWrapProfile,
  {
    templateSkillId: string;
    manifestBody: Omit<SkillManifest, "githubUrl" | "commit">;
    /** Self-contained task fixtures copied from bundled eval-skill (tge). */
    copyFixtureTasksFromTemplate: boolean;
  }
> = {
  "cde-v1": {
    templateSkillId: "code-debugging-eval",
    manifestBody: WRAP_MANIFEST_CDE,
    copyFixtureTasksFromTemplate: false,
  },
  "tge-v1": {
    templateSkillId: "test-generation-eval",
    manifestBody: WRAP_MANIFEST_TGE,
    copyFixtureTasksFromTemplate: true,
  },
};

export function normalizeAgentSkillWrapProfile(
  raw?: string | null,
): AgentSkillWrapProfile {
  const v = raw?.trim();
  if (v === "tge-v1") return "tge-v1";
  return "cde-v1";
}

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

function copyTreeNoSymlinks(src: string, dest: string): void {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    throw new Error(`symlink/junction not allowed: ${path.basename(src)}`);
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyTreeNoSymlinks(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  if (!st.isFile()) {
    throw new Error(`unsupported file type: ${path.basename(src)}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

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

/** Bundled eval-skill harness (grade.js + optional fixtures) for wrapped imports. */
export function resolveAgentSkillHarnessTemplate(
  tasksetSearchDirs: string[],
  profile: AgentSkillWrapProfile = "cde-v1",
): string {
  const { templateSkillId } = PROFILE_CONFIG[profile];
  for (const dir of tasksetSearchDirs) {
    const candidate = path.join(dir, templateSkillId);
    const gradeJs = path.join(candidate, "scripts", "grade.js");
    if (fs.existsSync(gradeJs)) {
      return candidate;
    }
  }
  throw new Error(
    `Agent skill import needs eval-skills/${templateSkillId} on disk (${profile} harness)`,
  );
}

/** Install fixtures/manifest.json + grade.js after copying a plain SKILL.md tree. */
export function applyAgentSkillHarness(
  skillDestDir: string,
  opts: {
    harnessTemplateDir: string;
    githubUrl: string;
    commit?: string;
    profile?: AgentSkillWrapProfile;
  },
): void {
  const profile = opts.profile ?? "cde-v1";
  const config = PROFILE_CONFIG[profile];
  const fixturesDir = path.join(skillDestDir, "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });

  if (config.copyFixtureTasksFromTemplate) {
    const srcFixtures = path.join(opts.harnessTemplateDir, "fixtures");
    for (const name of fs.readdirSync(srcFixtures)) {
      if (name === "manifest.json") continue;
      const src = path.join(srcFixtures, name);
      if (!fs.statSync(src).isDirectory()) continue;
      copyTreeNoSymlinks(src, path.join(fixturesDir, name));
    }
  }

  writeJsonFile(path.join(fixturesDir, "manifest.json"), {
    ...config.manifestBody,
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
