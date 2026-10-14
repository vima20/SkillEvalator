import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  compareBaselineCandidate,
  loadRunResult,
  readJsonFile,
  releaseWxLock,
  resolveComparisonLegs,
  resolveEvaluationMetaMode,
  tryAcquireWxLock,
  writeJsonFile,
  type RunComparison,
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
 * Sync mode / evalSkillId when provided so expectedEvaluationMode parity
 * matches the retried leg (stale meta must not leave Comparison INCONCLUSIVE).
 * Exclusive lock so concurrent baseline+candidate retries cannot clobber each other.
 */
export function updateEvaluationMetaLeg(opts: {
  evaluationId: string;
  role: "baseline" | "candidate";
  runId: string;
  mode?: "dry-run" | "official";
  evalSkillId?: string;
}): boolean {
  const evaluationId = assertSafeId(opts.evaluationId, "evaluationId");
  const runId = assertSafeId(opts.runId, "runId");
  const evalSkillId = opts.evalSkillId
    ? assertSafeId(opts.evalSkillId, "evalSkillId")
    : undefined;
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
      ...(opts.mode ? { mode: opts.mode } : {}),
      ...(evalSkillId ? { evalSkillId } : {}),
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
  baseline: ReturnType<typeof loadRunResult>;
  candidate: ReturnType<typeof loadRunResult>;
  comparison: RunComparison | null;
} {
  const meta = loadEvaluationMeta(evaluationId);
  const dir = resultsDir();
  assertSafeId(evaluationId, "evaluationId");

  const { baseline, candidate } = resolveComparisonLegs({
    meta: meta
      ? {
          baselineRunId: meta.baselineRunId,
          candidateRunId: meta.candidateRunId,
        }
      : null,
    loadResult: (runId) => loadRunResult(dir, runId),
  });

  const comparison =
    baseline && candidate
      ? (() => {
          const modePin = resolveEvaluationMetaMode({
            metaMode: meta?.mode,
            baselineMode: baseline.mode,
            candidateMode: candidate.mode,
            evaluationMetaPresent: Boolean(meta),
          });
          return compareBaselineCandidate(baseline, candidate, {
            ...(meta?.evalSkillId
              ? { expectedEvalSkillId: meta.evalSkillId }
              : {}),
            ...(modePin.expectedEvaluationMode
              ? { expectedEvaluationMode: modePin.expectedEvaluationMode }
              : {}),
            ...(modePin.issues.length
              ? { extraParityIssues: modePin.issues }
              : {}),
          });
        })()
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
