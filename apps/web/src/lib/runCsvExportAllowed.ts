import type { RunResult } from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { runCsvExportGate } from "@/lib/runCsvExport";

/** Same bar as GET /api/runs/[runId]/csv — for UI affordance. */
export function runCsvExportAllowed(result: RunResult | null | undefined): boolean {
  if (!result) return false;
  const packed = result.evaluationId
    ? loadEvaluationComparison(result.evaluationId)
    : null;
  return runCsvExportGate({
    result,
    comparisonVerdict: packed?.comparison?.verdict ?? null,
    comparisonMode: packed?.comparison?.mode ?? null,
    baselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
    candidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
  }).ok;
}
