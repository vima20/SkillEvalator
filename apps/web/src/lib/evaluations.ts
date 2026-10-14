import fs from "node:fs";
import path from "node:path";
import {
  assertSafeId,
  compareBaselineCandidate,
  loadRunResult,
  loadRunStatus,
  readJsonFile,
  releaseWxLock,
  resolveComparisonLegs,
  resolveEvaluationMetaEvalSkillId,
  resolveEvaluationMetaEvaluationId,
  resolveEvaluationMetaMode,
  resolveLegRunIdViaRetryChain,
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
    // Folder name is the audit path — reject meta that claims another id.
    if (raw.evaluationId !== evaluationId) {
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

function loadRetryChainLegInfo(
  resultsDirPath: string,
  runId: string,
): { evaluationId?: string; role?: string; status?: string } | null {
  const status = loadRunStatus(resultsDirPath, runId);
  if (status) {
    return {
      ...(typeof status.evaluationId === "string"
        ? { evaluationId: status.evaluationId }
        : {}),
      ...(status.role === "baseline" || status.role === "candidate"
        ? { role: status.role }
        : {}),
      ...(typeof status.status === "string" ? { status: status.status } : {}),
    };
  }
  const result = loadRunResult(resultsDirPath, runId);
  if (!result) return null;
  return {
    ...(result.evaluationId ? { evaluationId: result.evaluationId } : {}),
    ...(result.role ? { role: result.role } : {}),
    status: result.status,
  };
}

export function loadEvaluationComparison(
  evaluationId: string,
): {
  meta: EvaluationMeta | null;
  baseline: ReturnType<typeof loadRunResult>;
  candidate: ReturnType<typeof loadRunResult>;
  comparison: RunComparison | null;
} {
  let meta = loadEvaluationMeta(evaluationId);
  const dir = resultsDir();
  assertSafeId(evaluationId, "evaluationId");

  let baselineRunId = meta?.baselineRunId;
  let candidateRunId = meta?.candidateRunId;
  if (meta && baselineRunId && candidateRunId) {
    const loadLeg = (runId: string) => loadRetryChainLegInfo(dir, runId);
    const baseTip = resolveLegRunIdViaRetryChain({
      resultsDir: dir,
      fromRunId: baselineRunId,
      evaluationId,
      role: "baseline",
      loadLeg,
    });
    const candTip = resolveLegRunIdViaRetryChain({
      resultsDir: dir,
      fromRunId: candidateRunId,
      evaluationId,
      role: "candidate",
      loadLeg,
    });
    // Best-effort heal so the next load does not depend on retry-of walk.
    if (baseTip.hops > 0 && baseTip.runId !== baselineRunId) {
      if (
        updateEvaluationMetaLeg({
          evaluationId,
          role: "baseline",
          runId: baseTip.runId,
          ...(meta.mode === "dry-run" || meta.mode === "official"
            ? { mode: meta.mode }
            : {}),
          evalSkillId: meta.evalSkillId,
        })
      ) {
        baselineRunId = baseTip.runId;
        meta = loadEvaluationMeta(evaluationId) ?? meta;
      } else {
        baselineRunId = baseTip.runId;
      }
    }
    if (candTip.hops > 0 && candTip.runId !== candidateRunId) {
      if (
        updateEvaluationMetaLeg({
          evaluationId,
          role: "candidate",
          runId: candTip.runId,
          ...(meta.mode === "dry-run" || meta.mode === "official"
            ? { mode: meta.mode }
            : {}),
          evalSkillId: meta.evalSkillId,
        })
      ) {
        candidateRunId = candTip.runId;
        meta = loadEvaluationMeta(evaluationId) ?? meta;
      } else {
        candidateRunId = candTip.runId;
      }
    }
  }

  const { baseline, candidate } = resolveComparisonLegs({
    meta: meta && baselineRunId && candidateRunId
      ? {
          baselineRunId,
          candidateRunId,
        }
      : null,
    loadResult: (runId) => loadRunResult(dir, runId),
  });

  const comparison =
    baseline && candidate
      ? (() => {
          const metaPresent = Boolean(meta);
          const modePin = resolveEvaluationMetaMode({
            metaMode: meta?.mode,
            baselineMode: baseline.mode,
            candidateMode: candidate.mode,
            evaluationMetaPresent: metaPresent,
          });
          const skillPin = resolveEvaluationMetaEvalSkillId({
            metaEvalSkillId: meta?.evalSkillId,
            baselineEvalSkillId: baseline.evalSkillId,
            candidateEvalSkillId: candidate.evalSkillId,
            evaluationMetaPresent: metaPresent,
          });
          const evalIdPin = resolveEvaluationMetaEvaluationId({
            folderEvaluationId: evaluationId,
            metaEvaluationId: meta?.evaluationId,
            evaluationMetaPresent: metaPresent,
          });
          const extraParityIssues = [
            ...modePin.issues,
            ...skillPin.issues,
            ...evalIdPin.issues,
          ];
          return compareBaselineCandidate(baseline, candidate, {
            ...(skillPin.expectedEvalSkillId
              ? { expectedEvalSkillId: skillPin.expectedEvalSkillId }
              : {}),
            ...(modePin.expectedEvaluationMode
              ? { expectedEvaluationMode: modePin.expectedEvaluationMode }
              : {}),
            ...(evalIdPin.expectedEvaluationId
              ? { expectedEvaluationId: evalIdPin.expectedEvaluationId }
              : {}),
            ...(extraParityIssues.length ? { extraParityIssues } : {}),
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
