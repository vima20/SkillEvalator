import { NextResponse } from "next/server";
import {
  assertSafeId,
  loadRunResult,
  loadRunStatus,
  runResultToCsv,
} from "@skillevalator/core";
import {
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
} from "@/lib/exportResolve";
import { resultsDir } from "@/lib/paths";
import { runCsvExportGateForRun } from "@/lib/runCsvExportAllowed";

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
    const gate = runCsvExportGateForRun({ runId, result, status });
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          ...(gate.resultMode ? { mode: gate.resultMode } : {}),
          ...(gate.adoptionMode ? { adoptionMode: gate.adoptionMode } : {}),
          ...(gate.comparisonJsonMode
            ? { comparisonJsonMode: gate.comparisonJsonMode }
            : {}),
        },
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
