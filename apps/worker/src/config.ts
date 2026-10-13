import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  DEFAULT_COST_CAP_USD,
  MODEL_DRY_RUN,
  MODEL_OFFICIAL,
  findRepoRoot,
  resolveDataPaths,
} from "@skillevalator/core";

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
  importedSkillsDir: data.importedSkillsDir,
  skillsDirs: data.skillsDirs,
  jobsDir: data.jobsDir,
  resultsDir: data.resultsDir,
  modelDryRun: process.env.MODEL_DRY_RUN ?? MODEL_DRY_RUN,
  modelOfficial: process.env.MODEL_OFFICIAL ?? MODEL_OFFICIAL,
  temperature: num("MODEL_TEMPERATURE", 0),
  topP: num("MODEL_TOP_P", 1),
  seed: num("MODEL_SEED", 42),
  costCapUsd: num("COST_CAP_USD", DEFAULT_COST_CAP_USD),
  costHardStop: (process.env.COST_HARD_STOP ?? "true") !== "false",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  /** Per-request SDK timeout (ms). */
  openaiTimeoutMs: num("OPENAI_TIMEOUT_MS", 120_000),
  /** Cap completion size so one call cannot run unbounded. */
  maxOutputTokens: num("MODEL_MAX_OUTPUT_TOKENS", 4096),
  /** Host grade is only honored together with FAKE_PRODUCE=known-good (see runJob). */
  allowHostGrade: process.env.ALLOW_HOST_GRADE === "1",
};
