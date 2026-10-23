import type { RunResult } from "@skillevalator/core";
import { evaluationPairBrowseFromPacked } from "@/lib/evaluationPairBrowse";
import { loadEvaluationComparison } from "@/lib/evaluations";
import {
  EXPORT_RESULT_NOT_READY,
  exportGateBlockMessage,
} from "@/lib/exportResolve";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import { runCsvExportGateFromPacked } from "@/lib/runCsvExport";

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
  const pairBrowse = packed
    ? evaluationPairBrowseFromPacked(packed)
    : null;
  return runCsvExportGateFromPacked({
    result: opts.result,
    evaluationId,
    packed,
    pairBrowse,
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
