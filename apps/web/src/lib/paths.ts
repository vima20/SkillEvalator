import path from "node:path";
import { findRepoRoot, resolveDataPaths } from "@skillevalator/core";

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

export function skillsDirs(): string[] {
  const d = data();
  const dirs = Array.isArray(d.skillsDirs) ? d.skillsDirs : [];
  const fallback = [d.skillsDir, d.importedSkillsDir].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  const out = (dirs.length > 0 ? dirs : fallback).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return out.length > 0 ? out : [d.skillsDir].filter(Boolean);
}
