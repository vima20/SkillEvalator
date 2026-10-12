import { NextResponse } from "next/server";
import { assertSafeId, comparisonToCsv } from "@skillevalator/core";
import { loadEvaluationComparison } from "@/lib/evaluations";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ evaluationId: string }> },
) {
  try {
    const { evaluationId: raw } = await ctx.params;
    const evaluationId = assertSafeId(raw, "evaluationId");
    const { comparison } = loadEvaluationComparison(evaluationId);
    if (!comparison) {
      return NextResponse.json(
        { error: "comparison not ready" },
        { status: 404 },
      );
    }
    const csv = comparisonToCsv(comparison);
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
