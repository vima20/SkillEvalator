import path from "node:path";

export function repoRoot(): string {
  // apps/web -> repo root
  return path.resolve(process.cwd(), "../..");
}

export function jobsDir(): string {
  return path.resolve(process.env.JOBS_DIR ?? path.join(repoRoot(), "data/jobs"));
}

export function resultsDir(): string {
  return path.resolve(
    process.env.RESULTS_DIR ?? path.join(repoRoot(), "data/results"),
  );
}

export function skillsDir(): string {
  return path.resolve(
    process.env.EVAL_SKILLS_DIR ?? path.join(repoRoot(), "eval-skills"),
  );
}
