import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunResult,
  runResultToCsv,
} from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipBaselineRunId,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
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
    const result = loadRunResult(resultsDir(), runId);
    if (!result) {
      return NextResponse.json({ error: "result not ready" }, { status: 404 });
    }
    const packed = result.evaluationId
      ? loadEvaluationComparison(result.evaluationId)
      : null;
    const gate = runCsvExportGate({
      result,
      comparisonVerdict: packed?.comparison?.verdict ?? null,
      comparisonMode: packed?.comparison?.mode ?? null,
      baselineRunId: packed ? resolveTipBaselineRunId(packed) : null,
      candidateRunId: packed ? resolveTipCandidateRunId(packed) : null,
      metaSmoke: packed?.meta?.smoke === true,
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
    const status = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
