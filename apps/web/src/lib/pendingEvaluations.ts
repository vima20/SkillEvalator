import { syncStatusFromResult } from "@skillevalator/core";
import {
  listEvaluations,
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { resultsDir } from "@/lib/paths";
import { runIsActive } from "@/lib/status";

/**
 * True when any evaluation still waits for a tip leg that can change.
 * Uses the same tip status source as Comparison list `tipActive`
 * (syncStatusFromResult + result.json), so cancelled/failed tips without
 * result.json do not keep list auto-refresh spinning.
 */
export function hasPendingEvaluations(): boolean {
  const root = resultsDir();
  return listEvaluations().some((e) => {
    const packed = loadEvaluationComparison(e.evaluationId);
    if (packed.comparison) return false;
    const baseHas = Boolean(packed.baseline);
    const candHas = Boolean(packed.candidate);
    // Both legs already have result.json — Comparison may be blocked, but
    // polling will not produce a new tip status.
    if (baseHas && candHas) return false;

    const tipBase =
      resolveTipBaselineRunId(packed) ?? packed.meta?.baselineRunId;
    const tipCand =
      resolveTipCandidateRunId(packed) ?? packed.meta?.candidateRunId;
    const baseStatus =
      (tipBase ? syncStatusFromResult(root, tipBase)?.status : undefined) ??
      packed.baseline?.status;
    const candStatus =
      (tipCand ? syncStatusFromResult(root, tipCand)?.status : undefined) ??
      packed.candidate?.status;

    return (
      runIsActive(baseStatus, baseHas) || runIsActive(candStatus, candHas)
    );
  });
}
