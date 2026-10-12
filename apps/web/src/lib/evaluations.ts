import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  compareBaselineCandidate,
  loadRunResult,
  pairEvaluationRuns,
  readJsonFile,
  releaseWxLock,
  tryAcquireWxLock,
  writeJsonFile,
  type RunComparison,
  type RunResult,
} from "@skillevalator/core";
import { resultsDir } from "@/lib/paths";

export type EvaluationMeta = {
  evaluationId: string;
  evalSkillId: string;
  mode: string;
  baselineRunId: string;
  candidateRunId: string;
  createdAt: string;
  updatedAt?: string;
};

export function evaluationMetaPath(evaluationId: string): string {
  const id = assertSafeId(evaluationId, "evaluationId");
  return path.join(resultsDir(), id, "evaluation.json");
}

export function loadEvaluationMeta(
  evaluationId: string,
): EvaluationMeta | null {
  const p = evaluationMetaPath(evaluationId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = readJsonFile(p) as EvaluationMeta;
    if (!raw?.evaluationId || !raw.baselineRunId || !raw.candidateRunId) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * After a paired-leg retry, point Comparison at the new runId for that role.
 * Exclusive lock so concurrent baseline+candidate retries cannot clobber each other.
 */
export function updateEvaluationMetaLeg(opts: {
  evaluationId: string;
  role: "baseline" | "candidate";
  runId: string;
}): boolean {
  const evaluationId = assertSafeId(opts.evaluationId, "evaluationId");
  const runId = assertSafeId(opts.runId, "runId");
  const metaPath = evaluationMetaPath(evaluationId);
  const lockPath = `${metaPath}.lock`;
  if (!tryAcquireWxLock(lockPath, { staleMs: 60_000, retries: 80 })) {
    return false;
  }
  try {
    const meta = loadEvaluationMeta(evaluationId);
    if (!meta) return false;
    const next: EvaluationMeta = {
      ...meta,
      ...(opts.role === "baseline"
        ? { baselineRunId: runId }
        : { candidateRunId: runId }),
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(metaPath, next);
    return true;
  } finally {
    releaseWxLock(lockPath);
  }
}

export function loadEvaluationComparison(
  evaluationId: string,
): {
  meta: EvaluationMeta | null;
  baseline: RunResult | null;
  candidate: RunResult | null;
  comparison: RunComparison | null;
} {
  const meta = loadEvaluationMeta(evaluationId);
  const dir = resultsDir();

  let baseline: RunResult | null = null;
  let candidate: RunResult | null = null;

  if (meta) {
    baseline = loadRunResult(dir, meta.baselineRunId);
    candidate = loadRunResult(dir, meta.candidateRunId);
  }

  // Fallback: scan runs that share evaluationId (legacy / partial).
  if (!baseline || !candidate) {
    const matched: RunResult[] = [];
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        try {
          assertSafeId(name, "runId");
        } catch {
          continue;
        }
        const r = loadRunResult(dir, name);
        if (r?.evaluationId === evaluationId) matched.push(r);
      }
    }
    const paired = pairEvaluationRuns(matched);
    baseline = baseline ?? paired.baseline;
    candidate = candidate ?? paired.candidate;
  }

  const comparison =
    baseline && candidate
      ? compareBaselineCandidate(baseline, candidate)
      : null;

  return { meta, baseline, candidate, comparison };
}

export function listEvaluations(): EvaluationMeta[] {
  const dir = resultsDir();
  if (!fs.existsSync(dir)) return [];
  const out: EvaluationMeta[] = [];
  for (const name of fs.readdirSync(dir)) {
    try {
      assertSafeId(name, "evaluationId");
    } catch {
      continue;
    }
    const meta = loadEvaluationMeta(name);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
