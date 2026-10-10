import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { findRepoRoot, resolveDataPaths } from "@skillevalator/core";

const repoRoot = findRepoRoot(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
);
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config();

const data = resolveDataPaths(repoRoot);

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  repoRoot,
  skillsDir: data.skillsDir,
  jobsDir: data.jobsDir,
  resultsDir: data.resultsDir,
  modelDryRun: process.env.MODEL_DRY_RUN ?? "gpt-4o-mini",
  modelOfficial: process.env.MODEL_OFFICIAL ?? "gpt-4.1-mini",
  temperature: num("MODEL_TEMPERATURE", 0),
  topP: num("MODEL_TOP_P", 1),
  seed: num("MODEL_SEED", 42),
  costCapUsd: num("COST_CAP_USD", 5),
  costHardStop: (process.env.COST_HARD_STOP ?? "true") !== "false",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Host grade is only honored together with FAKE_PRODUCE=known-good (see runJob). */
  allowHostGrade: process.env.ALLOW_HOST_GRADE === "1",
};
