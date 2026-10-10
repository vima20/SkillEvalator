import fs from "node:fs";
import path from "node:path";
import { readJsonFile, readJsonFileAs } from "./fsJson.js";
import { assertSafeId, resolveUnder } from "./paths.js";
import { RunResultSchema, type RunResult } from "./schema.js";
import { z } from "zod";

const StatusFileSchema = z.object({
  runId: z.string().optional(),
  status: z.string().optional(),
  costUsd: z.number().optional(),
  repeat: z.number().optional(),
  repeats: z.number().optional(),
});

export type RunStatusFile = z.infer<typeof StatusFileSchema>;

export type RunListItem = {
  runId: string;
  status?: string;
  result: RunResult | null;
};

function runDir(resultsDir: string, runId: string): string {
  return resolveUnder(resultsDir, assertSafeId(runId, "runId"));
}

export function listRunIds(resultsDir: string): string[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir)
    .filter((id) => {
      try {
        assertSafeId(id, "runId");
      } catch {
        return false;
      }
      return fs.existsSync(path.join(resultsDir, id, "status.json"));
    })
    .sort((a, b) => b.localeCompare(a));
}

export function loadRunStatus(
  resultsDir: string,
  runId: string,
): RunStatusFile | null {
  const p = path.join(runDir(resultsDir, runId), "status.json");
  if (!fs.existsSync(p)) return null;
  try {
    return StatusFileSchema.parse(readJsonFile(p));
  } catch {
    return null;
  }
}

export function loadRunResult(
  resultsDir: string,
  runId: string,
): RunResult | null {
  const p = path.join(runDir(resultsDir, runId), "result.json");
  if (!fs.existsSync(p)) return null;
  try {
    return readJsonFileAs(RunResultSchema, p);
  } catch {
    return null;
  }
}

export function listRuns(resultsDir: string): RunListItem[] {
  return listRunIds(resultsDir).map((runId) => ({
    runId,
    status: loadRunStatus(resultsDir, runId)?.status,
    result: loadRunResult(resultsDir, runId),
  }));
}
