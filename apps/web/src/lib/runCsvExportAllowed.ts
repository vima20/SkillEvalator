import type { RunResult } from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { runCsvExportGate } from "@/lib/runCsvExport";

function runCsvExportGateForResult(result: RunResult) {
  const packed = result.evaluationId
    ? loadEvaluationComparison(result.evaluationId)
    : null;
  return runCsvExportGate({
    result,
    comparisonVerdict: packed?.comparison?.verdict ?? null,
    comparisonMode: packed?.comparison?.mode ?? null,
    baselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
    candidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
    metaSmoke: packed?.meta?.smoke === true,
    baselineFakeProduce: packed?.baseline?.capture?.env?.fakeProduce === true,
    candidateFakeProduce:
      packed?.candidate?.capture?.env?.fakeProduce === true,
  });
}

/** Same bar as GET /api/runs/[runId]/csv — for UI affordance. */
export function runCsvExportAllowed(
  result: RunResult | null | undefined,
): boolean {
  if (!result) return false;
  return runCsvExportGateForResult(result).ok;
}

/** Gate error text when CSV is locked (same string as API 409). */
export function runCsvExportBlockReason(
  result: RunResult | null | undefined,
): string | null {
  if (!result) return "result not ready";
  const gate = runCsvExportGateForResult(result);
  return gate.ok ? null : gate.error;
}
