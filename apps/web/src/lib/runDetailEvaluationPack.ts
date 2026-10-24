import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  evaluationIdFromSources,
  loadRunResult,
  loadRunStatus,
  readJsonFile,
  syncStatusFromResult,
  type RunResult,
} from "@skillevalator/core";
import {
  comparisonExportContextFromBrowse,
  evaluationPairBrowseFromPacked,
  pairedAdoptionModesFromPacked,
  pairedEvalPreferOfficialFromPacked,
  type EvaluationPairBrowseEntry,
} from "@/lib/evaluationPairBrowse";
import { loadEvaluationComparison } from "@/lib/evaluations";
import { exportGateBlockMessage } from "@/lib/exportResolve";
import { runCsvExportGateFromPacked } from "@/lib/runCsvExport";
import {
  evaluationPairPending,
  type EvaluationPairPending,
} from "@/lib/evaluationTipPair";
import { jobsDir, resultsDir } from "@/lib/paths";
import {
  runDetailPairHarness,
  type RunDetailPairHarness,
} from "@/lib/runDetailPairHarness";
import { listWindDownRunIds } from "@/lib/status";

function readJobEvaluationIdFromPaths(
  candidates: string[],
): string | undefined {
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const job = JobManifestSchema.parse(readJsonFile(p));
      if (typeof job.evaluationId === "string" && job.evaluationId) {
        return job.evaluationId;
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}

/**
 * Terminal-only job evaluationId (failed → done → cancelled).
 * Skips artifacts that parse but lack evaluationId — unlike loadFailedJob
 * which stops at the first existing file. Used by Retry UI + POST parity.
 */
export function loadTerminalJobEvaluationId(runId: string): string | undefined {
  const dir = jobsDir();
  return readJobEvaluationIdFromPaths([
    path.join(dir, `${runId}.failed.json`),
    path.join(dir, `${runId}.done.json`),
    path.join(dir, `${runId}.cancelled.json`),
  ]);
}

/**
 * Job-layer evaluationId for status → job → result (display / cancel / list).
 * Prefer terminal artifacts, then live queue/claim (same sources worker claim
 * can see). Retry admission must use loadTerminalJobEvaluationId instead.
 */
export function loadJobEvaluationId(runId: string): string | undefined {
  const dir = jobsDir();
  return readJobEvaluationIdFromPaths([
    path.join(dir, `${runId}.failed.json`),
    path.join(dir, `${runId}.done.json`),
    path.join(dir, `${runId}.cancelled.json`),
    // Live: queued / claimed / mid-enqueue (after terminals).
    path.join(dir, `${runId}.running.json`),
    path.join(dir, `${runId}.json`),
    path.join(dir, `${runId}.tmp.json`),
  ]);
}

/**
 * status → job → result — same order as worker claim / run detail.
 * Pair harness must use this, not result-only evaluationId.
 */
export function resolveRunDetailEvaluationId(opts: {
  runId: string;
  status?: { evaluationId?: string } | null;
  result?: { evaluationId?: string } | null;
  /** Injected for tests (skip disk). */
  jobEvaluationId?: string | null;
}): string | null {
  const jobEvaluationId =
    opts.jobEvaluationId !== undefined
      ? (opts.jobEvaluationId ?? undefined)
      : loadJobEvaluationId(opts.runId);
  return (
    evaluationIdFromSources({
      statusEvaluationId: opts.status?.evaluationId,
      jobEvaluationId,
      resultEvaluationId: opts.result?.evaluationId,
    }) ?? null
  );
}

/**
 * status → terminal job → result for Retry admission + POST /retry.
 * Does not read live .json / .running.json (retry config stays terminal-only).
 */
export function resolveRetryEvaluationId(opts: {
  runId: string;
  status?: { evaluationId?: string } | null;
  result?: { evaluationId?: string } | null;
  /** Injected for tests (skip disk). */
  jobEvaluationId?: string | null;
}): string | null {
  const jobEvaluationId =
    opts.jobEvaluationId !== undefined
      ? (opts.jobEvaluationId ?? undefined)
      : loadTerminalJobEvaluationId(opts.runId);
  return (
    evaluationIdFromSources({
      statusEvaluationId: opts.status?.evaluationId,
      jobEvaluationId,
      resultEvaluationId: opts.result?.evaluationId,
    }) ?? null
  );
}

/**
 * List rows (Dashboard / Runs / Benefit index) and GET /api/runs:
 * same status → job → result order as run detail. Do not use
 * `listRuns().evaluationId` or `result?.evaluationId` alone — those are
 * result-first and can disagree with status.json / failed job.
 */
export function resolveListRunEvaluationId(opts: {
  runId: string;
  result?: { evaluationId?: string } | null;
  /** Injected status.evaluationId (skip disk). */
  statusEvaluationId?: string | null;
  /** Injected job evaluationId (skip disk). */
  jobEvaluationId?: string | null;
  /** When statusEvaluationId omitted, load from this results root (default resultsDir()). */
  resultsRoot?: string;
}): string | null {
  let statusEvaluationId = opts.statusEvaluationId;
  if (statusEvaluationId === undefined) {
    try {
      const root = opts.resultsRoot ?? resultsDir();
      statusEvaluationId =
        loadRunStatus(root, opts.runId)?.evaluationId ?? null;
    } catch {
      statusEvaluationId = null;
    }
  }
  return resolveRunDetailEvaluationId({
    runId: opts.runId,
    status:
      statusEvaluationId != null && statusEvaluationId !== ""
        ? { evaluationId: statusEvaluationId }
        : null,
    result: opts.result,
    jobEvaluationId: opts.jobEvaluationId,
  });
}

export type RunDetailEvaluationPack = {
  evaluationId: string | null;
  tipCandidateRunId: string | null;
  pairHarness: RunDetailPairHarness | null;
  /** Same waiting/unavailable gate as Benefit detail / Comparison list. */
  pairPending?: EvaluationPairPending;
  /** Official Comparison provisional PASS (1/N) — Benefit USE still locked. */
  comparisonProvisional?: { step: number; required: number };
  /** Verdict chip + tooltip (Runs / Dashboard Comparison column parity). */
  comparisonMeta?: { label: string; title?: string };
  /** Tip-leg display mode (not stale comparison.json). */
  pairedDisplayMode?: string;
  /** When on-disk comparison.json mode lags tip resolution. */
  comparisonJsonMode?: string;
  metaMode?: string;
  baselineMode?: string;
  candidateMode?: string;
  /** Tip-resolved ?mode=official handoff (Comparison / Benefit parity). */
  preferOfficialHandoff?: boolean;
  /** Same gate as GET /api/runs/[runId]/csv (computed with one pair browse). */
  csvExportAllowed?: boolean;
  csvExportBlockReason?: string | null;
};

/**
 * Tip legs still in orphan wind-down while pairPending=waiting — same ids
 * Benefit detail passes to BenefitPairWaitingRefresh (Run detail finalize).
 */
export function loadPairWaitingWindDownRunIds(opts: {
  pairPending?: EvaluationPairPending | null;
  baselineRunId?: string | null;
  candidateRunId?: string | null;
  root?: string;
}): string[] {
  if (opts.pairPending !== "waiting") return [];
  const ids = [
    ...new Set(
      [opts.baselineRunId, opts.candidateRunId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  if (ids.length === 0) return [];
  const root = opts.root ?? resultsDir();
  return listWindDownRunIds(
    ids.map((id) => ({
      runId: id,
      status: syncStatusFromResult(root, id)?.status,
      result: loadRunResult(root, id),
    })),
  );
}

/**
 * SSR + GET /api/runs/[runId] packed evaluation context for pair callouts.
 */
export function loadRunDetailEvaluationPack(opts: {
  runId: string;
  status?: { evaluationId?: string } | null;
  result?: { evaluationId?: string } | null;
  jobEvaluationId?: string | null;
  /** Injected packed eval for tests. */
  loadPacked?: (evaluationId: string) => ReturnType<
    typeof loadEvaluationComparison
  >;
}): RunDetailEvaluationPack {
  const evaluationId = resolveRunDetailEvaluationId(opts);
  const csvFromResult = (
    packed: ReturnType<typeof loadEvaluationComparison> | null,
    pairBrowse: EvaluationPairBrowseEntry | null,
  ) => {
    if (!opts.result || !("mode" in opts.result)) return {};
    const gate = runCsvExportGateFromPacked({
      result: opts.result as RunResult,
      evaluationId,
      packed,
      pairBrowse,
    });
    return {
      csvExportAllowed: gate.ok,
      csvExportBlockReason: gate.ok ? null : exportGateBlockMessage(gate),
    };
  };
  if (!evaluationId) {
    return {
      evaluationId: null,
      tipCandidateRunId: null,
      pairHarness: null,
      ...csvFromResult(null, null),
    };
  }
  const loadPacked = opts.loadPacked ?? loadEvaluationComparison;
  const packed = loadPacked(evaluationId);
  const pairPending = evaluationPairPending(packed, { runId: opts.runId });
  const pairBrowse = evaluationPairBrowseFromPacked(packed);
  const {
    comparisonMeta,
    comparisonProvisional,
    tipCandidateRunId,
    pairedDisplayMode,
  } = pairBrowse;
  const comparisonJsonMode = packed.comparison
    ? comparisonExportContextFromBrowse(packed, pairBrowse).comparisonJsonMode
    : undefined;
  return {
    evaluationId,
    tipCandidateRunId,
    pairHarness: runDetailPairHarness(packed),
    ...(pairPending ? { pairPending } : {}),
    ...(comparisonProvisional ? { comparisonProvisional } : {}),
    ...(comparisonMeta ? { comparisonMeta } : {}),
    ...(pairedDisplayMode ? { pairedDisplayMode } : {}),
    ...(comparisonJsonMode ? { comparisonJsonMode } : {}),
    ...pairedAdoptionModesFromPacked(packed),
    preferOfficialHandoff: pairedEvalPreferOfficialFromPacked(packed),
    ...csvFromResult(packed, pairBrowse),
  };
}
