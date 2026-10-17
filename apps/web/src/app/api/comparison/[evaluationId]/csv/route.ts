import { NextResponse } from "next/server";
import { assertSafeId, comparisonToCsv } from "@skillevalator/core";
import { comparisonCsvGate } from "@/lib/comparisonExport";
import { loadEvaluationComparison } from "@/lib/evaluations";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ evaluationId: string }> },
) {
  try {
    const { evaluationId: raw } = await ctx.params;
    const evaluationId = assertSafeId(raw, "evaluationId");
    const { meta, comparison, baseline, candidate } =
      loadEvaluationComparison(evaluationId);
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
    const gate = comparisonCsvGate(comparison, {
      metaSmoke: meta.smoke === true,
      baselineFakeProduce: baseline?.capture?.env?.fakeProduce === true,
      candidateFakeProduce: candidate?.capture?.env?.fakeProduce === true,
      baselineProduceAttested:
        baseline?.capture?.env?.produceAttested === true,
      candidateProduceAttested:
        candidate?.capture?.env?.produceAttested === true,
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          error: gate.error,
          errorCode: gate.errorCode,
          verdict: gate.verdict,
          mode: gate.mode,
          rationale: comparison.rationale,
        },
        { status: gate.status },
      );
    }
    const csv = comparisonToCsv(comparison, {
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
    const status = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
