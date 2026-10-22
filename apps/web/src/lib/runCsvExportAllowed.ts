import type { RunResult } from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import {
  EXPORT_RESULT_NOT_READY,
  exportGateBlockMessage,
} from "@/lib/exportResolve";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import { runCsvExportGate } from "@/lib/runCsvExport";

/** Shared by GET /api/runs/[runId]/csv and run detail CSV affordance. */
export function runCsvExportGateForRun(opts: {
  runId: string;
  result: RunResult;
  status?: { evaluationId?: string } | null;
}) {
  const evaluationId = resolveRunDetailEvaluationId({
    runId: opts.runId,
    status: opts.status,
    result: opts.result,
  });
  const packed = evaluationId
    ? loadEvaluationComparison(evaluationId)
    : null;
  return runCsvExportGate({
    result: opts.result,
    evaluationId,
    comparisonVerdict: packed?.comparison?.verdict ?? null,
    comparisonMode: packed?.comparison?.mode ?? null,
    comparisonAdoptionConfirmation:
      packed?.comparison?.adoptionConfirmation ?? null,
    baselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
    candidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
    metaSmoke: packed?.meta?.smoke === true,
    baselineFakeProduce: packed?.baseline?.capture?.env?.fakeProduce === true,
    candidateFakeProduce:
      packed?.candidate?.capture?.env?.fakeProduce === true,
    baselineProduceAttested:
      packed?.baseline?.capture?.env?.produceAttested === true,
    candidateProduceAttested:
      packed?.candidate?.capture?.env?.produceAttested === true,
    metaMode: packed?.meta?.mode,
    baselineMode: packed?.baseline?.mode,
    candidateMode: packed?.candidate?.mode,
  });
}

/** Same bar as GET /api/runs/[runId]/csv — for UI affordance. */
export function runCsvExportAllowed(opts: {
  runId: string;
  result: RunResult | null | undefined;
  status?: { evaluationId?: string } | null;
}): boolean {
  if (!opts.result) return false;
  return runCsvExportGateForRun({
    runId: opts.runId,
    result: opts.result,
    status: opts.status,
  }).ok;
}

/** Gate error text when CSV is locked (same string as API 409 / downloadExport). */
export function runCsvExportBlockReason(opts: {
  runId: string;
  result: RunResult | null | undefined;
  status?: { evaluationId?: string } | null;
}): string | null {
  if (!opts.result) {
    return exportGateBlockMessage({
      errorCode: "export_result_not_ready",
      error: EXPORT_RESULT_NOT_READY,
    });
  }
  const gate = runCsvExportGateForRun({
    runId: opts.runId,
    result: opts.result,
    status: opts.status,
  });
  return gate.ok ? null : exportGateBlockMessage(gate);
}
