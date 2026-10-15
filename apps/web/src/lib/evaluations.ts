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
  resolveTrustedGradeHashFromRunResultDir,
  resolveTrustedPromptHashFromRunResultDir,
  resolveTrustedSnapshotManifestPinsFromRunResultDir,
  tryAcquireWxLock,
  unlinkBenefitReportCache,
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
  /** Fixture plant (smoke:official) — never adoption PASS on disk. */
  smoke?: boolean;
};

export function evaluationMetaPath(evaluationId: string): string {
  const id = assertSafeId(evaluationId, "evaluationId");
  return path.join(resultsDir(), id, "evaluation.json");
}

/**
 * Tip candidate runId for UI / leaderboard — same bar as Comparison list + CSV.
 * Prefer Comparison object, fall back to healed meta when Comparison is pending.
 */
export function resolveTipCandidateRunId(packed: {
  comparison?: { candidateRunId?: string } | null;
  meta?: { candidateRunId?: string } | null;
}): string | null {
  return (
    packed.comparison?.candidateRunId ?? packed.meta?.candidateRunId ?? null
  );
}

/** Tip baseline runId (Comparison first, then healed meta). */
export function resolveTipBaselineRunId(packed: {
  comparison?: { baselineRunId?: string } | null;
  meta?: { baselineRunId?: string } | null;
}): string | null {
  return (
    packed.comparison?.baselineRunId ?? packed.meta?.baselineRunId ?? null
  );
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
    const prevLegId =
      opts.role === "baseline" ? meta.baselineRunId : meta.candidateRunId;
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
    // Drop superseded tip's cached Benefit so offline USE cannot outlive tip move.
    if (prevLegId && prevLegId !== runId) {
      unlinkStaleBenefitReport(prevLegId);
    }
    return true;
  } finally {
    releaseWxLock(lockPath);
  }
}

/** Best-effort drop of a run's cached Benefit (superseded tip / heal lock miss). */
export function unlinkStaleBenefitReport(runId: string): void {
  unlinkBenefitReportCache(resultsDir(), runId);
}

/**
 * Tip-healed baseline/candidate runIds for cancel cascade.
 * Follows retry-of in memory (and best-effort disk heal) so cancelling a
 * superseded disk tip cannot kill the live sibling.
 */
export function resolveHealedMetaLegsForCancel(evaluationId: string): {
  baselineRunId: string;
  candidateRunId: string;
} | null {
  const id = assertSafeId(evaluationId, "evaluationId");
  const meta = loadEvaluationMeta(id);
  if (!meta?.baselineRunId || !meta?.candidateRunId) return null;
  const dir = resultsDir();
  const loadLeg = (runId: string) => loadRetryChainLegInfo(dir, runId);

  const baseTip = resolveLegRunIdViaRetryChain({
    resultsDir: dir,
    fromRunId: meta.baselineRunId,
    evaluationId: id,
    role: "baseline",
    loadLeg,
  });
  const candTip = resolveLegRunIdViaRetryChain({
    resultsDir: dir,
    fromRunId: meta.candidateRunId,
    evaluationId: id,
    role: "candidate",
    loadLeg,
  });

  let baselineRunId = meta.baselineRunId;
  let candidateRunId = meta.candidateRunId;
  const modePin =
    meta.mode === "dry-run" || meta.mode === "official"
      ? { mode: meta.mode as "dry-run" | "official" }
      : {};

  if (baseTip.hops > 0 && baseTip.runId !== baselineRunId) {
    const prev = baselineRunId;
    if (
      updateEvaluationMetaLeg({
        evaluationId: id,
        role: "baseline",
        runId: baseTip.runId,
        ...modePin,
        evalSkillId: meta.evalSkillId,
      })
    ) {
      baselineRunId = baseTip.runId;
    } else {
      // In-memory tip only — still drop superseded Benefit so USE cannot linger.
      unlinkStaleBenefitReport(prev);
      baselineRunId = baseTip.runId;
    }
  }
  if (candTip.hops > 0 && candTip.runId !== candidateRunId) {
    const prev = candidateRunId;
    if (
      updateEvaluationMetaLeg({
        evaluationId: id,
        role: "candidate",
        runId: candTip.runId,
        ...modePin,
        evalSkillId: meta.evalSkillId,
      })
    ) {
      candidateRunId = candTip.runId;
    } else {
      unlinkStaleBenefitReport(prev);
      candidateRunId = candTip.runId;
    }
  }

  try {
    return {
      baselineRunId: assertSafeId(baselineRunId, "runId"),
      candidateRunId: assertSafeId(candidateRunId, "runId"),
    };
  } catch {
    return null;
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
      const prev = baselineRunId;
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
        // Lock miss: Comparison still uses tip in memory — drop stale USE cache.
        if (prev) unlinkStaleBenefitReport(prev);
        baselineRunId = baseTip.runId;
      }
    }
    if (candTip.hops > 0 && candTip.runId !== candidateRunId) {
      const prev = candidateRunId;
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
        if (prev) unlinkStaleBenefitReport(prev);
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
          const officialDisk =
            modePin.expectedEvaluationMode === "official" ||
            baseline.mode === "official" ||
            candidate.mode === "official";
          // Tip snapshot pins — grade from candidate; prompt hashes from each leg.
          const expectedGradeHash = officialDisk
            ? resolveTrustedGradeHashFromRunResultDir(dir, candidate.runId)
            : undefined;
          const expectedBaselinePromptHash = officialDisk
            ? resolveTrustedPromptHashFromRunResultDir(dir, baseline.runId)
            : undefined;
          const expectedCandidatePromptHash = officialDisk
            ? resolveTrustedPromptHashFromRunResultDir(dir, candidate.runId)
            : undefined;
          const baselineSnapPins = officialDisk
            ? resolveTrustedSnapshotManifestPinsFromRunResultDir(
                dir,
                baseline.runId,
              )
            : {};
          const candidateSnapPins = officialDisk
            ? resolveTrustedSnapshotManifestPinsFromRunResultDir(
                dir,
                candidate.runId,
              )
            : {};
          const extraParityIssues = [
            ...modePin.issues,
            ...skillPin.issues,
            ...evalIdPin.issues,
          ];
          if (officialDisk && meta?.smoke === true) {
            extraParityIssues.push(
              "official Comparison rejects evaluation.json smoke=true (fixture plant)",
            );
          }
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
            ...(expectedGradeHash ? { expectedGradeHash } : {}),
            ...(expectedBaselinePromptHash
              ? { expectedBaselinePromptHash }
              : {}),
            ...(expectedCandidatePromptHash
              ? { expectedCandidatePromptHash }
              : {}),
            ...(baselineSnapPins.evalSkillVersion
              ? {
                  expectedBaselineEvalSkillVersion:
                    baselineSnapPins.evalSkillVersion,
                }
              : {}),
            ...(candidateSnapPins.evalSkillVersion
              ? {
                  expectedCandidateEvalSkillVersion:
                    candidateSnapPins.evalSkillVersion,
                }
              : {}),
            ...(baselineSnapPins.promptKind
              ? { expectedBaselinePromptKind: baselineSnapPins.promptKind }
              : {}),
            ...(candidateSnapPins.promptKind
              ? { expectedCandidatePromptKind: candidateSnapPins.promptKind }
              : {}),
            ...(extraParityIssues.length ? { extraParityIssues } : {}),
          });
        })()
      : null;

  // Always return tip leg ids in meta (even when disk heal lock failed) so
  // Comparison UI Benefit/status CTAs match the Comparison verdict legs.
  if (meta && baselineRunId && candidateRunId) {
    if (
      meta.baselineRunId !== baselineRunId ||
      meta.candidateRunId !== candidateRunId
    ) {
      meta = {
        ...meta,
        baselineRunId,
        candidateRunId,
      };
    }
  }

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
