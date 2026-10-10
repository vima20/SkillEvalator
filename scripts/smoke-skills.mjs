#!/usr/bin/env node
/**
 * Harness smoke for all eval skills (no OpenAI):
 * known-good must pass grade; known-bad must fail.
 * Usage: npm run smoke:skills
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findRepoRoot,
  gradeOnHost,
  listSkills,
  loadSkill,
  taskIdsForMode,
  taskPaths,
} from "../packages/core/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(path.resolve(__dirname, ".."));
const skillsDir = path.join(repoRoot, "eval-skills");

let failed = 0;

const skills = listSkills(skillsDir);
if (skills.length === 0) {
  console.error("No skills found under", skillsDir);
  process.exit(1);
}

for (const summary of skills) {
  const skill = loadSkill(skillsDir, summary.id);
  const taskIds = taskIdsForMode(skill, "dry-run");
  console.log(`\n== ${skill.id} (${taskIds.length} dry-run tasks) ==`);

  for (const taskId of taskIds) {
    const tp = taskPaths(skill, taskId);
    const good = gradeOnHost({
      skillRoot: skill.root,
      taskDir: tp.taskDir,
      targetFile: tp.targetFile,
      artifactPath: tp.knownGoodPath,
    });
    const bad = gradeOnHost({
      skillRoot: skill.root,
      taskDir: tp.taskDir,
      targetFile: tp.targetFile,
      artifactPath: tp.knownBadPath,
    });

    const ok = good.exitCode === 0 && bad.exitCode !== 0;
    if (!ok) failed += 1;
    console.log(
      ok ? "  PASS" : "  FAIL",
      taskId,
      `good=${good.exitCode}`,
      `bad=${bad.exitCode}`,
    );
  }
}

console.log("");
if (failed > 0) {
  console.error(`Smoke failed: ${failed} task check(s)`);
  process.exit(1);
}
console.log(`Smoke OK: ${skills.length} skill(s)`);
