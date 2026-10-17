import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunResult,
  loadRunStatus,
  runResultToCsv,
} from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import {
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
} from "@/lib/exportResolve";
import { resolveRunDetailEvaluationId } from "@/lib/runDetailEvaluationPack";
import { resultsDir } from "@/lib/paths";
import { runCsvExportGate } from "@/lib/runCsvExport";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId: raw } = await ctx.params;
    const runId = assertSafeId(raw, "runId");
    const root = resultsDir();
    const result = loadRunResult(root, runId);
    if (!result) {
      return NextResponse.json(
        {
          error: "result not ready",
          errorCode: "export_result_not_ready",
        },
        { status: 404 },
      );
    }
    const status = loadRunStatus(root, runId);
    // Same status → job → result id as run detail pairHarness / retryAdmission.
    const evaluationId = resolveRunDetailEvaluationId({
      runId,
      status,
      result,
    });
    const packed = evaluationId
      ? loadEvaluationComparison(evaluationId)
      : null;
    const gate = runCsvExportGate({
      result,
      evaluationId,
      comparisonVerdict: packed?.comparison?.verdict ?? null,
      comparisonMode: packed?.comparison?.mode ?? null,
      baselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
      candidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
      metaSmoke: packed?.meta?.smoke === true,
      baselineFakeProduce:
        packed?.baseline?.capture?.env?.fakeProduce === true,
      candidateFakeProduce:
        packed?.candidate?.capture?.env?.fakeProduce === true,
      baselineProduceAttested:
        packed?.baseline?.capture?.env?.produceAttested === true,
      candidateProduceAttested:
        packed?.candidate?.capture?.env?.produceAttested === true,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, errorCode: gate.errorCode },
        { status: gate.status },
      );
    }
    const csv = runResultToCsv(result);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${runId}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message.startsWith("invalid ")) {
      return NextResponse.json(
        {
          error: message || EXPORT_INVALID_REQUEST_ERROR,
          errorCode: "export_invalid_request",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: message.trim() ? message : EXPORT_FAILED_ERROR,
        errorCode: "export_failed",
      },
      { status: 500 },
    );
  }
}
