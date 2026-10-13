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
  /** Mid-run / queued Unikie role (before result.json exists). */
  role: z.enum(["baseline", "candidate"]).optional(),
  /** Mid-run / queued paired evaluation id. */
  evaluationId: z.string().optional(),
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

/** Narrow credit/billing detection — avoid blocking retries on vague "quota" text. */
function looksLikeNoCredits(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("insufficient_quota") ||
    m.includes("no credits") ||
    m.includes("credits remaining") ||
    m.includes("credit balance") ||
    m.includes("exceeded your current quota") ||
    m.includes("billing_not_active") ||
    m.includes("billing_hard_limit") ||
    (m.includes("billing") && m.includes("hard limit"))
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

    // Prefer explicit API codes; only use message heuristics when code is absent/generic.
    const noCredits =
      code === "insufficient_quota" ||
      code === "billing_not_active" ||
      code === "billing_hard_limit_reached" ||
      looksLikeNoCredits(msg);
    const rateLimited =
      code === "rate_limit_exceeded" ||
      (e.status === 429 && !noCredits);

    if (noCredits && code !== "rate_limit_exceeded") {
      code = code?.startsWith("billing_") ? code : "insufficient_quota";
      msg =
        "No OpenAI credits remaining. Add billing credits before retrying.";
    } else if (rateLimited) {
      code = "rate_limit_exceeded";
      msg =
        "OpenAI rate limit (429). Wait a moment, then retry manually — no automatic backoff.";
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
  /** From status.json when result is not ready yet. */
  role?: "baseline" | "candidate";
  evaluationId?: string;
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
 * If result.json has a terminal status, status.json must match it.
 * Heals queued/running/cancel_requested leftovers and mismatched terminals
 * (e.g. failed overwritten after result.json was already ok/cancelled).
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

  if (current?.status === result.status) {
    const role = result.role ?? current.role;
    const evaluationId = result.evaluationId ?? current.evaluationId;
    const needCost =
      typeof result.costUsd === "number" && current.costUsd !== result.costUsd;
    const needMeta =
      (role && role !== current.role) ||
      (evaluationId && evaluationId !== current.evaluationId);
    if (needCost || needMeta) {
      const next: RunStatusFile = {
        ...current,
        ...(needCost ? { costUsd: result.costUsd } : {}),
        ...(role ? { role } : {}),
        ...(evaluationId ? { evaluationId } : {}),
      };
      writeJsonFile(path.join(runDir(resultsDir, runId), "status.json"), next);
      return next;
    }
    return current;
  }

  const next: RunStatusFile = {
    runId,
    status: result.status,
    costUsd: result.costUsd,
    ...(result.role ? { role: result.role } : current?.role ? { role: current.role } : {}),
    ...(result.evaluationId
      ? { evaluationId: result.evaluationId }
      : current?.evaluationId
        ? { evaluationId: current.evaluationId }
        : {}),
  };
  writeJsonFile(path.join(runDir(resultsDir, runId), "status.json"), next);
  return next;
}

export function listRuns(resultsDir: string): RunListItem[] {
  return listRunIds(resultsDir).map((runId) => {
    const st = syncStatusFromResult(resultsDir, runId);
    const result = loadRunResult(resultsDir, runId);
    return {
      runId,
      status: st?.status,
      error: st?.error,
      errorCode: st?.errorCode,
      role: result?.role ?? st?.role,
      evaluationId: result?.evaluationId ?? st?.evaluationId,
      result,
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

/** True when a job file still means the worker may be writing this run. */
function hasLiveJobFile(jobsDir: string, runId: string): boolean {
  return (
    fs.existsSync(path.join(jobsDir, `${runId}.json`)) ||
    fs.existsSync(path.join(jobsDir, `${runId}.tmp.json`)) ||
    fs.existsSync(path.join(jobsDir, `${runId}.running.json`))
  );
}

/**
 * Delete terminal runs older than `olderThanMs` (by status.json mtime).
 * Never touches queued/running jobs (live .json / .running.json / .tmp.json).
 * `budget_stop` without result.json is wind-down — not purgeable yet.
 * After removals, drops or rewrites evaluation.json that pointed at purged runs.
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
    // Fail-closed: status may say terminal while the worker still owns the job.
    if (hasLiveJobFile(jobsDir, runId)) continue;
    // budget_stop mid wind-down has no result yet — heal/orphan, don't purge.
    if (
      status === "budget_stop" &&
      !fs.existsSync(path.join(resultsDir, runId, "result.json"))
    ) {
      continue;
    }

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

  if (removed.length > 0) {
    healEvaluationMetasAfterPurge(resultsDir, new Set(removed));
  }
  return { removed };
}

type EvaluationMetaFile = {
  evaluationId?: string;
  baselineRunId?: string;
  candidateRunId?: string;
  [key: string]: unknown;
};

/** Remove or rewrite evaluation.json when purged runs were referenced. */
export function healEvaluationMetasAfterPurge(
  resultsDir: string,
  purgedRunIds: Set<string>,
): void {
  if (!fs.existsSync(resultsDir) || purgedRunIds.size === 0) return;
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.startsWith("eval_")) continue;
    try {
      assertSafeId(name, "evaluationId");
    } catch {
      continue;
    }
    const metaPath = path.join(resultsDir, name, "evaluation.json");
    if (!fs.existsSync(metaPath)) continue;
    let meta: EvaluationMetaFile;
    try {
      meta = readJsonFile(metaPath) as EvaluationMetaFile;
    } catch {
      continue;
    }
    const baselineRunId =
      typeof meta.baselineRunId === "string" ? meta.baselineRunId : undefined;
    const candidateRunId =
      typeof meta.candidateRunId === "string" ? meta.candidateRunId : undefined;
    const baseGone = !!baselineRunId && purgedRunIds.has(baselineRunId);
    const candGone = !!candidateRunId && purgedRunIds.has(candidateRunId);
    if (!baseGone && !candGone) continue;

    // Clear dangling Comparison links on the surviving leg (if any).
    const surviving = [
      !baseGone ? baselineRunId : undefined,
      !candGone ? candidateRunId : undefined,
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    for (const runId of surviving) {
      clearEvaluationIdFromRun(resultsDir, runId);
    }

    // Pair is incomplete once either leg is gone — drop Comparison meta.
    try {
      fs.rmSync(path.join(resultsDir, name), {
        recursive: true,
        force: true,
      });
    } catch {
      /* ignore */
    }
  }
}

/** Drop dangling Comparison refs from status.json and result.json. */
function clearEvaluationIdFromRun(resultsDir: string, runId: string): void {
  try {
    assertSafeId(runId, "runId");
  } catch {
    return;
  }
  for (const fileName of ["status.json", "result.json"] as const) {
    const filePath = path.join(resultsDir, runId, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const prior = readJsonFile(filePath) as Record<string, unknown>;
      if (typeof prior.evaluationId !== "string") continue;
      const { evaluationId: _drop, ...rest } = prior;
      writeJsonFile(filePath, rest);
    } catch {
      /* ignore */
    }
  }
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
