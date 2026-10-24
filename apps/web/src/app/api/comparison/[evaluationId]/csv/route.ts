import { NextResponse } from "next/server";
import { assertSafeId, comparisonToCsv } from "@skillevalator/core";
import { comparisonCsvGate } from "@/lib/comparisonExport";
import { comparisonExportContextFromPacked } from "@/lib/evaluationPairBrowse";
import { loadEvaluationComparison } from "@/lib/evaluations";
import {
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
} from "@/lib/exportResolve";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ evaluationId: string }> },
) {
  try {
    const { evaluationId: raw } = await ctx.params;
    const evaluationId = assertSafeId(raw, "evaluationId");
    const packed = loadEvaluationComparison(evaluationId);
    const { meta, comparison, baseline, candidate } = packed;
    if (!meta || !comparison) {
      return NextResponse.json(
        !meta
          ? {
              error:
                "evaluation.json missing — comparison CSV requires paired meta",
              errorCode: "export_evaluation_meta_missing",
            }
          : {
              error: "comparison not ready",
              errorCode: "export_comparison_not_ready",
            },
        { status: 404 },
      );
    }
    const exportCtx = comparisonExportContextFromPacked(packed);
    const gate = comparisonCsvGate(comparison, exportCtx.evidence);
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          verdict: gate.verdict,
          mode: gate.mode,
          adoptionMode: exportCtx.adoptionMode,
          ...(exportCtx.comparisonJsonMode
            ? { comparisonJsonMode: exportCtx.comparisonJsonMode }
            : {}),
          rationale: comparison.rationale,
        },
        { status: gate.status },
      );
    }
    const csv = comparisonToCsv(comparison, {
      adoptionMode: exportCtx.adoptionMode,
      baselineFakeProduce: baseline?.capture?.env?.fakeProduce === true,
      baselineProduceAttested:
        baseline?.capture?.env?.produceAttested === true,
      candidateFakeProduce: candidate?.capture?.env?.fakeProduce === true,
      candidateProduceAttested:
        candidate?.capture?.env?.produceAttested === true,
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${evaluationId}.csv"`,
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
