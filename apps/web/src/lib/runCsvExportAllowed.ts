import type { RunResult } from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import { runCsvExportGate } from "@/lib/runCsvExport";

function runCsvExportGateForRun(opts: {
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

/** Gate error text when CSV is locked (same string as API 409). */
export function runCsvExportBlockReason(opts: {
  runId: string;
  result: RunResult | null | undefined;
  status?: { evaluationId?: string } | null;
}): string | null {
  if (!opts.result) return "result not ready";
  const gate = runCsvExportGateForRun({
    runId: opts.runId,
    result: opts.result,
    status: opts.status,
  });
  return gate.ok ? null : gate.error;
}
