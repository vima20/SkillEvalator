import { NextResponse } from "next/server";
import {
  benefitReportToCsv,
  benefitReportToMarkdown,
  loadRunResult,
  loadRunStatus,
} from "@skillevalator/core";
import { benefitExportGate } from "@/lib/benefitExport";
import { buildBenefitReportBundle } from "@/lib/benefitWithComparison";
import {
  pairedAdoptionComparisonMode,
  pairedAdoptionModesFromPacked,
  pairExportEvidenceFromPacked,
} from "@/lib/evaluationPairBrowse";
import {
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
} from "@/lib/exportResolve";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const root = resultsDir();
    const result = loadRunResult(root, runId);
    if (!result) {
      return NextResponse.json(
        {
          error: "result not found",
          errorCode: "export_result_not_found",
        },
        { status: 404 },
      );
    }
    const status = loadRunStatus(root, runId);
    const { report, comparison, packed } = buildBenefitReportBundle(result, {
      runId,
      status,
    });
    const format = new URL(req.url).searchParams.get("format");
    const pairEvidence = packed ? pairExportEvidenceFromPacked(packed) : {};
    const gate = benefitExportGate({
      report,
      comparison,
      fakeProduce: result.capture?.env?.fakeProduce === true,
      ...pairEvidence,
    });
    if (format === "md" || format === "markdown" || format === "csv") {
      if (!gate.ok) {
        return NextResponse.json(
          {
            error: gate.error,
            errorCode: gate.errorCode,
            recommendation: gate.recommendation,
            ...(gate.mode ? { mode: gate.mode } : {}),
          },
          { status: gate.status },
        );
      }
    }
    if (format === "md" || format === "markdown") {
      return new NextResponse(benefitReportToMarkdown(report), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `inline; filename="${runId}-benefit.md"`,
          "cache-control": "no-store",
        },
      });
    }
    if (format === "csv") {
      return new NextResponse(
        benefitReportToCsv(report, {
          comparisonVerdict: comparison?.verdict,
          comparisonMode:
            comparison && packed
              ? pairedAdoptionComparisonMode(
                  comparison,
                  pairedAdoptionModesFromPacked(packed),
                )
              : comparison?.mode,
          comparisonLift: comparison?.lift,
          fakeProduce: result.capture?.env?.fakeProduce === true,
          produceAttested: result.capture?.env?.produceAttested === true,
        }),
        {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${runId}-benefit.csv"`,
            "cache-control": "no-store",
          },
        },
      );
    }
    // JSON: never attach adoption markdown unless the export gate passes.
    if (!gate.ok) {
      return NextResponse.json({
        report,
        exportAllowed: false,
        error: gate.error,
        errorCode: gate.errorCode,
        recommendation: gate.recommendation,
        ...(gate.mode ? { mode: gate.mode } : {}),
      });
    }
    return NextResponse.json({
      report,
      markdown: benefitReportToMarkdown(report),
      exportAllowed: true,
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
