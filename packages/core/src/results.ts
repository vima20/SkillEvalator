import fs from "node:fs";
import path from "node:path";
import { readJsonFile, readJsonFileAs, writeJsonFile } from "./fsJson.js";
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

/** Error codes that should not be auto-retried (billing / account). */
export const NON_RETRYABLE_ERROR_CODES = new Set([
  "insufficient_quota",
  "billing_not_active",
  "billing_hard_limit_reached",
  "account_deactivated",
]);

function looksLikeNoCredits(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("insufficient") ||
    m.includes("quota") ||
    m.includes("credit") ||
    m.includes("billing") ||
    m.includes("exceeded your current quota")
  );
}

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
      name?: string;
      error?: { message?: string; code?: string; type?: string };
    };

    if (
      e.name === "ProduceCancelledError" ||
      e.code === "cancelled" ||
      (typeof e.message === "string" &&
        e.message.toLowerCase().includes("produce cancelled"))
    ) {
      return { error: "Cancelled during produce", errorCode: "cancelled" };
    }

    let msg =
      e.error?.message?.trim() ||
      (typeof e.message === "string" ? e.message.trim() : "") ||
      String(err);
    let code =
      e.error?.code ||
      e.code ||
      (typeof e.status === "number" ? `http_${e.status}` : undefined);

    if (
      e.status === 429 ||
      code === "insufficient_quota" ||
      code === "rate_limit_exceeded" ||
      looksLikeNoCredits(msg)
    ) {
      if (looksLikeNoCredits(msg) || code === "insufficient_quota") {
        code = "insufficient_quota";
        msg =
          "No OpenAI credits remaining. Add billing credits before retrying.";
      } else if (code === "rate_limit_exceeded" || e.status === 429) {
        code = code === "insufficient_quota" ? code : "rate_limit_exceeded";
        if (code === "rate_limit_exceeded") {
          msg =
            "OpenAI rate limit (429). Wait a moment, then retry manually — no automatic backoff.";
        }
      }
    }

    return {
      error: msg.slice(0, 800),
      ...(code ? { errorCode: String(code).slice(0, 64) } : {}),
    };
  }
  return { error: String(err).slice(0, 800) };
}

export function isNonRetryableErrorCode(code: string | undefined): boolean {
  return Boolean(code && NON_RETRYABLE_ERROR_CODES.has(code));
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

const TERMINAL_RUN_STATUS = new Set([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
]);

/**
 * If result.json exists with a terminal status but status.json is still
 * queued/running, rewrite status.json to match (heals orphan finalize race).
 * Returns the (possibly updated) status file, or null if no status/result.
 */
export function syncStatusFromResult(
  resultsDir: string,
  runId: string,
): RunStatusFile | null {
  const result = loadRunResult(resultsDir, runId);
  const current = loadRunStatus(resultsDir, runId);
  if (!result) return current;
  if (!TERMINAL_RUN_STATUS.has(result.status)) return current;

  if (current?.status && TERMINAL_RUN_STATUS.has(current.status)) {
    return current;
  }

  const next: RunStatusFile = {
    runId,
    status: result.status,
    costUsd: result.costUsd,
  };
  writeJsonFile(path.join(runDir(resultsDir, runId), "status.json"), next);
  return next;
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

const TERMINAL_PURGE = new Set([
  "ok",
  "failed",
  "cancelled",
  "budget_stop",
]);

function removeJobArtifacts(jobsDir: string, runId: string): void {
  const suffixes = [
    ".json",
    ".running.json",
    ".done.json",
    ".failed.json",
    ".cancelled.json",
    ".tmp.json",
    ".cancel",
    ".worker.pid",
  ];
  for (const s of suffixes) {
    try {
      fs.unlinkSync(path.join(jobsDir, `${runId}${s}`));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Delete terminal runs older than `olderThanMs` (by status.json mtime).
 * Never touches queued/running jobs.
 */
export function purgeTerminalRunsFs(
  resultsDir: string,
  jobsDir: string,
  opts: { olderThanMs: number },
): { removed: string[] } {
  const removed: string[] = [];
  const cutoff = Date.now() - Math.max(0, opts.olderThanMs);
  if (!fs.existsSync(resultsDir)) return { removed };

  for (const runId of listRunIds(resultsDir)) {
    const statusPath = path.join(resultsDir, runId, "status.json");
    let status = "unknown";
    try {
      const raw = StatusFileSchema.parse(readJsonFile(statusPath));
      status = raw.status ?? "unknown";
    } catch {
      continue;
    }
    if (!TERMINAL_PURGE.has(status)) continue;

    let mtime = 0;
    try {
      mtime = fs.statSync(statusPath).mtimeMs;
    } catch {
      continue;
    }
    if (mtime > cutoff) continue;

    try {
      fs.rmSync(path.join(resultsDir, runId), { recursive: true, force: true });
      removeJobArtifacts(jobsDir, runId);
      removed.push(runId);
    } catch {
      /* ignore one failure */
    }
  }
  return { removed };
}

/** Write a marker that cleanup ran (optional audit). */
export function recordPurgeAudit(
  resultsDir: string,
  removed: string[],
): void {
  if (removed.length === 0) return;
  try {
    writeJsonFile(path.join(resultsDir, ".last-purge.json"), {
      at: new Date().toISOString(),
      removedCount: removed.length,
      removed: removed.slice(0, 200),
    });
  } catch {
    /* ignore */
  }
}
