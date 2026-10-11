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
  /** Short worker/UI-facing failure reason when no result.json exists. */
  error: z.string().max(800).optional(),
  errorCode: z.string().max(64).optional(),
});

export type RunStatusFile = z.infer<typeof StatusFileSchema>;

/** Normalize thrown errors for status.json (no huge stacks). */
export function formatRunError(err: unknown): {
  error: string;
  errorCode?: string;
} {
  if (err && typeof err === "object") {
    const e = err as {
      message?: string;
      status?: number;
      code?: string;
      error?: { message?: string; code?: string; type?: string };
    };
    const msg =
      e.error?.message?.trim() ||
      (typeof e.message === "string" ? e.message.trim() : "") ||
      String(err);
    const code =
      e.error?.code ||
      e.code ||
      (typeof e.status === "number" ? `http_${e.status}` : undefined);
    return {
      error: msg.slice(0, 800),
      ...(code ? { errorCode: String(code).slice(0, 64) } : {}),
    };
  }
  return { error: String(err).slice(0, 800) };
}

export type RunListItem = {
  runId: string;
  status?: string;
  error?: string;
  errorCode?: string;
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
  return listRunIds(resultsDir).map((runId) => {
    const st = loadRunStatus(resultsDir, runId);
    return {
      runId,
      status: st?.status,
      error: st?.error,
      errorCode: st?.errorCode,
      result: loadRunResult(resultsDir, runId),
    };
  });
}
