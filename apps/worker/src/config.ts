import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function findRepoRoot(): string {
  // Prefer walking up from this file: apps/worker/src -> repo root
  let dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(dir, "eval-skills")) &&
      fs.existsSync(path.join(dir, "package.json"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd());
}

const repoRoot = findRepoRoot();
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  repoRoot,
  skillsDir: path.resolve(process.env.EVAL_SKILLS_DIR ?? path.join(repoRoot, "eval-skills")),
  jobsDir: path.resolve(process.env.JOBS_DIR ?? path.join(repoRoot, "data/jobs")),
  resultsDir: path.resolve(
    process.env.RESULTS_DIR ?? path.join(repoRoot, "data/results"),
  ),
  modelDryRun: process.env.MODEL_DRY_RUN ?? "gpt-4o-mini",
  modelOfficial: process.env.MODEL_OFFICIAL ?? "gpt-4.1-mini",
  temperature: num("MODEL_TEMPERATURE", 0),
  topP: num("MODEL_TOP_P", 1),
  seed: num("MODEL_SEED", 42),
  costCapUsd: num("COST_CAP_USD", 5),
  costHardStop: (process.env.COST_HARD_STOP ?? "true") !== "false",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  allowHostGrade: process.env.ALLOW_HOST_GRADE === "1",
};
