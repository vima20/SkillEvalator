import fs from "node:fs";
import path from "node:path";
import {
  JobManifestSchema,
  evaluationIdFromSources,
  readJsonFile,
} from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { jobsDir } from "@/lib/paths";
import {
  runDetailPairHarness,
  type RunDetailPairHarness,
} from "@/lib/runDetailPairHarness";

/** Same job candidates as retry POST / admission. */
export function loadJobEvaluationId(runId: string): string | undefined {
  const candidates = [
    path.join(jobsDir(), `${runId}.failed.json`),
    path.join(jobsDir(), `${runId}.done.json`),
    path.join(jobsDir(), `${runId}.cancelled.json`),
  ];
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
 * status → job → result — same as POST /retry and retryAdmission.
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

export type RunDetailEvaluationPack = {
  evaluationId: string | null;
  tipCandidateRunId: string | null;
  pairHarness: RunDetailPairHarness | null;
};

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
  if (!evaluationId) {
    return {
      evaluationId: null,
      tipCandidateRunId: null,
      pairHarness: null,
    };
  }
  const loadPacked = opts.loadPacked ?? loadEvaluationComparison;
  const packed = loadPacked(evaluationId);
  return {
    evaluationId,
    tipCandidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
    pairHarness: runDetailPairHarness(packed),
  };
}
