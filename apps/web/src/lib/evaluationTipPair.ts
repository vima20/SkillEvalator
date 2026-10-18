import { syncStatusFromResult } from "@skillevalator/core";
import {
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
  type EvaluationMeta,
} from "@/lib/evaluations";
import { resultsDir } from "@/lib/paths";
import { runIsActive } from "@/lib/status";

type PackedTips = {
  comparison?: { baselineRunId?: string; candidateRunId?: string } | null;
  meta?: EvaluationMeta | null;
  baseline?: { status?: string } | null;
  candidate?: { status?: string } | null;
};

/**
 * Same tip-activity gate as Comparison list `tipActive` /
 * `hasPendingEvaluations`: status.json via syncStatusFromResult, else result.
 */
export function evaluationTipPairIsActive(packed: PackedTips): boolean {
  const root = resultsDir();
  const baseHas = Boolean(packed.baseline);
  const candHas = Boolean(packed.candidate);
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
}
