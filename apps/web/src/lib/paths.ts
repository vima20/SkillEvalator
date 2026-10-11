import path from "node:path";
import {
  findRepoRoot,
  resolveDataPaths,
  skillsSearchDirs,
} from "@skillevalator/core";

function root(): string {
  // Prefer walking up from cwd (apps/web when next runs) or parent.
  return findRepoRoot(path.resolve(process.cwd()));
}

const data = () => resolveDataPaths(root());

export function repoRoot(): string {
  return root();
}

export function jobsDir(): string {
  return data().jobsDir;
}

export function resultsDir(): string {
  return data().resultsDir;
}

export function skillsDir(): string {
  return data().skillsDir;
}

export function importedSkillsDir(): string {
  return data().importedSkillsDir;
}

export function allSkillsDirs(): string[] {
  return skillsSearchDirs(data());
}
