import fs from "node:fs";
import path from "node:path";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Walk up from startDir until repo markers (eval-skills + package.json) are found. */
export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, "eval-skills")) &&
      fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

/** Reject path traversal and absolute segments in user-controlled ids. */
export function assertSafeId(id: string, label = "id"): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`invalid ${label}`);
  }
  return id;
}

/** Resolve segments under root; throw if the result escapes root. */
export function resolveUnder(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...segments);
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path escapes root");
  }
  return resolved;
}

export type DataPaths = {
  repoRoot: string;
  skillsDir: string;
  jobsDir: string;
  resultsDir: string;
};

/** Resolve env path relative to repoRoot (not process.cwd), so web/worker agree. */
function resolveFromRepo(repoRoot: string, value: string | undefined, fallback: string): string {
  if (!value || value.trim() === "") return path.resolve(repoRoot, fallback);
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(repoRoot, value);
}

export function resolveDataPaths(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): DataPaths {
  return {
    repoRoot,
    skillsDir: resolveFromRepo(repoRoot, env.EVAL_SKILLS_DIR, "eval-skills"),
    jobsDir: resolveFromRepo(repoRoot, env.JOBS_DIR, "data/jobs"),
    resultsDir: resolveFromRepo(repoRoot, env.RESULTS_DIR, "data/results"),
  };
}

/** Job files waiting to be claimed (excludes .running / .done / .failed / .tmp). */
export function isQueuedJobFile(fileName: string): boolean {
  // No dots in the basename before .json — status suffixes use extra dots.
  return /^run_[A-Za-z0-9_-]+\.json$/.test(fileName);
}
