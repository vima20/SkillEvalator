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

/**
 * Best-effort drop of a run's cached Benefit (superseded tip after retry-of heal).
 * Offline readers must not keep USE after the Comparison tip moved.
 */
export function unlinkBenefitReportCache(
  resultsDirPath: string,
  runId: string,
): void {
  try {
    const p = path.join(runDir(resultsDirPath, runId), "benefit-report.json");
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* best-effort */
  }
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
      // Prefer explicit result.role; never invent "candidate" when omitted.
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
export function hasLiveJobFile(jobsDir: string, runId: string): boolean {
  const id = assertSafeId(runId, "runId");
  return (
    fs.existsSync(path.join(jobsDir, `${id}.json`)) ||
    fs.existsSync(path.join(jobsDir, `${id}.tmp.json`)) ||
    fs.existsSync(path.join(jobsDir, `${id}.running.json`))
  );
}

/**
 * Run ids named as baseline/candidate in any evaluation.json.
 * Purge must not delete these — healEvaluationMetasAfterPurge would drop the
 * whole eval_* Comparison archive.
 */
export function collectEvalLinkedRunIds(resultsDir: string): Set<string> {
  const linked = new Set<string>();
  if (!fs.existsSync(resultsDir)) return linked;
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.startsWith("eval_")) continue;
    try {
      assertSafeId(name, "evaluationId");
    } catch {
      continue;
    }
    const metaPath = path.join(resultsDir, name, "evaluation.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = readJsonFile(metaPath) as EvaluationMetaFile;
      if (typeof meta.baselineRunId === "string" && meta.baselineRunId) {
        linked.add(meta.baselineRunId);
      }
      if (typeof meta.candidateRunId === "string" && meta.candidateRunId) {
        linked.add(meta.candidateRunId);
      }
    } catch {
      /* ignore unreadable meta */
    }
  }
  return linked;
}

/** Official mode on result.json or status.json — pilot archive, never age-purge. */
export function isOfficialRunFs(resultsDir: string, runId: string): boolean {
  try {
    assertSafeId(runId, "runId");
  } catch {
    return false;
  }
  for (const fileName of ["result.json", "status.json"] as const) {
    const filePath = path.join(resultsDir, runId, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = readJsonFile(filePath) as { mode?: unknown };
      if (raw.mode === "official") return true;
    } catch {
      // Unreadable result with a status sibling: keep scanning.
    }
  }
  return false;
}

export type PurgeSkipReason = "official" | "eval_linked";

/**
 * Delete terminal runs older than `olderThanMs` (by status.json mtime).
 * Never touches queued/running jobs (live .json / .running.json / .tmp.json).
 * `budget_stop` without result.json is wind-down — not purgeable yet.
 * Never deletes official runs or legs named in evaluation.json (pilot archive).
 * After removals, drops or rewrites evaluation.json that pointed at purged runs.
 */
export function purgeTerminalRunsFs(
  resultsDir: string,
  jobsDir: string,
  opts: { olderThanMs: number },
): {
  removed: string[];
  skipped: Array<{ runId: string; reason: PurgeSkipReason }>;
} {
  const removed: string[] = [];
  const skipped: Array<{ runId: string; reason: PurgeSkipReason }> = [];
  const cutoff = Date.now() - Math.max(0, opts.olderThanMs);
  if (!fs.existsSync(resultsDir)) return { removed, skipped };

  const evalLinked = collectEvalLinkedRunIds(resultsDir);

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

    if (isOfficialRunFs(resultsDir, runId)) {
      skipped.push({ runId, reason: "official" });
      continue;
    }
    if (evalLinked.has(runId)) {
      skipped.push({ runId, reason: "eval_linked" });
      continue;
    }

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
  return { removed, skipped };
}

type EvaluationMetaFile = {
  evaluationId?: string;
  baselineRunId?: string;
  candidateRunId?: string;
  smoke?: unknown;
  mode?: unknown;
  [key: string]: unknown;
};

function runHasFakeProduceFs(resultsDir: string, runId: string): boolean {
  try {
    assertSafeId(runId, "runId");
  } catch {
    return false;
  }
  const resultPath = path.join(resultsDir, runId, "result.json");
  if (!fs.existsSync(resultPath)) return false;
  try {
    const raw = readJsonFile(resultPath) as {
      capture?: { env?: { fakeProduce?: unknown } };
    };
    return raw.capture?.env?.fakeProduce === true;
  } catch {
    return false;
  }
}

function terminalStatusForPurge(
  resultsDir: string,
  runId: string,
): string | null {
  const statusPath = path.join(resultsDir, runId, "status.json");
  if (!fs.existsSync(statusPath)) return null;
  try {
    const raw = StatusFileSchema.parse(readJsonFile(statusPath));
    return raw.status ?? "unknown";
  } catch {
    return null;
  }
}

/** True when the run is settled and safe to delete (no live job / wind-down). */
export function isSettledPurgeableRunFs(
  resultsDir: string,
  jobsDir: string,
  runId: string,
): boolean {
  const status = terminalStatusForPurge(resultsDir, runId);
  if (!status || !TERMINAL_PURGE.has(status)) return false;
  if (hasLiveJobFile(jobsDir, runId)) return false;
  if (
    status === "budget_stop" &&
    !fs.existsSync(path.join(resultsDir, runId, "result.json"))
  ) {
    return false;
  }
  return true;
}

function removeRunDirFs(
  resultsDir: string,
  jobsDir: string,
  runId: string,
): boolean {
  try {
    assertSafeId(runId, "runId");
    fs.rmSync(path.join(resultsDir, runId), { recursive: true, force: true });
    removeJobArtifacts(jobsDir, runId);
    return true;
  } catch {
    return false;
  }
}

export type SmokePurgeSkipReason =
  | "live_job"
  | "not_terminal"
  | "live_official";

/**
 * Delete smoke harness noise immediately (no age gate):
 * - evaluation.json smoke=true pairs (whole eval_* + both legs) when no
 *   attested live official tip remains
 * - orphan runs with capture.env.fakeProduce
 * Never deletes attested live official (produceAttested=true, not FAKE_PRODUCE).
 * Mixed smoke+live pairs are left untouched (no half-delete).
 * Never touches queued/running / budget_stop wind-down.
 */
export function purgeSmokeNoiseFs(
  resultsDir: string,
  jobsDir: string,
): {
  removed: string[];
  removedEvaluations: string[];
  skipped: Array<{ id: string; reason: SmokePurgeSkipReason }>;
} {
  const removed: string[] = [];
  const removedEvaluations: string[] = [];
  const skipped: Array<{ id: string; reason: SmokePurgeSkipReason }> = [];
  const removeRuns = new Set<string>();
  const removeEvals = new Set<string>();

  if (!fs.existsSync(resultsDir)) {
    return { removed, removedEvaluations, skipped };
  }

  const skip = (id: string, reason: SmokePurgeSkipReason) => {
    if (!skipped.some((s) => s.id === id && s.reason === reason)) {
      skipped.push({ id, reason });
    }
  };

  /** Live worker evidence — not smoke:official disk plants (no produceAttested). */
  const isLiveOfficialEvidenceFs = (runId: string): boolean => {
    if (!isOfficialRunFs(resultsDir, runId)) return false;
    if (runHasFakeProduceFs(resultsDir, runId)) return false;
    const resultPath = path.join(resultsDir, runId, "result.json");
    if (!fs.existsSync(resultPath)) return false;
    try {
      const raw = readJsonFile(resultPath) as {
        capture?: { env?: { produceAttested?: unknown } };
      };
      return raw.capture?.env?.produceAttested === true;
    } catch {
      return false;
    }
  };

  // Pass 1: smoke evaluations → schedule eval + both legs only when no live
  // attested official tip remains (smoke:official plants without attest still purge).
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
    const legs = [baselineRunId, candidateRunId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    const smokeMeta = meta.smoke === true;
    const fakeLeg = legs.some((id) => runHasFakeProduceFs(resultsDir, id));
    if (!smokeMeta && !fakeLeg) continue;

    const protectedLegs = legs.filter((id) => isLiveOfficialEvidenceFs(id));
    if (protectedLegs.length > 0) {
      for (const runId of protectedLegs) skip(runId, "live_official");
      // Mixed smoke/live pair: leave eval + all legs alone (no half-delete).
      continue;
    }

    let blocked = false;
    for (const runId of legs) {
      if (hasLiveJobFile(jobsDir, runId)) {
        skip(runId, "live_job");
        blocked = true;
        continue;
      }
      if (!isSettledPurgeableRunFs(resultsDir, jobsDir, runId)) {
        // Missing leg dir is OK (partial plant); non-terminal / wind-down blocks.
        if (fs.existsSync(path.join(resultsDir, runId, "status.json"))) {
          skip(runId, "not_terminal");
          blocked = true;
        }
      }
    }
    if (blocked) continue;

    removeEvals.add(name);
    for (const runId of legs) removeRuns.add(runId);
  }

  // Pass 2: orphan FAKE_PRODUCE runs only (never half-delete a linked pair).
  const evalLinked = collectEvalLinkedRunIds(resultsDir);
  for (const runId of listRunIds(resultsDir)) {
    if (removeRuns.has(runId)) continue;
    if (evalLinked.has(runId)) continue;
    if (!runHasFakeProduceFs(resultsDir, runId)) continue;
    if (hasLiveJobFile(jobsDir, runId)) {
      skip(runId, "live_job");
      continue;
    }
    if (!isSettledPurgeableRunFs(resultsDir, jobsDir, runId)) {
      skip(runId, "not_terminal");
      continue;
    }
    removeRuns.add(runId);
  }

  // Hard stop: never delete attested live official archive.
  for (const runId of [...removeRuns]) {
    if (isLiveOfficialEvidenceFs(runId)) {
      removeRuns.delete(runId);
      skip(runId, "live_official");
    }
  }

  // Drop eval_* schedule if a protected live official leg is still linked.
  for (const evalId of [...removeEvals]) {
    try {
      const meta = readJsonFile(
        path.join(resultsDir, evalId, "evaluation.json"),
      ) as EvaluationMetaFile;
      const legs = [meta.baselineRunId, meta.candidateRunId].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      );
      if (legs.some((id) => isLiveOfficialEvidenceFs(id))) {
        removeEvals.delete(evalId);
      }
    } catch {
      /* ignore */
    }
  }

  for (const runId of removeRuns) {
    if (removeRunDirFs(resultsDir, jobsDir, runId)) removed.push(runId);
  }

  for (const evalId of removeEvals) {
    try {
      fs.rmSync(path.join(resultsDir, evalId), {
        recursive: true,
        force: true,
      });
      removedEvaluations.push(evalId);
    } catch {
      /* ignore */
    }
  }

  // Drop dangling eval_* if a smoke orphan run tore a non-smoke pair (shouldn't).
  if (removed.length > 0) {
    healEvaluationMetasAfterPurge(resultsDir, new Set(removed));
  }

  return { removed, removedEvaluations, skipped };
}

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
