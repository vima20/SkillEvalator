import type { RunResult } from "@skillevalator/core";
import { loadEvaluationComparison } from "@/lib/evaluations";
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
    baselineRunId:
      packed?.comparison?.baselineRunId ?? packed?.meta?.baselineRunId ?? null,
    candidateRunId:
      packed?.comparison?.candidateRunId ?? packed?.meta?.candidateRunId ?? null,
  }).ok;
}
