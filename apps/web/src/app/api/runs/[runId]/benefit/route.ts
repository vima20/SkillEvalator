import { NextResponse } from "next/server";
import {
  benefitReportToCsv,
  benefitReportToMarkdown,
  loadRunResult,
} from "@skillevalator/core";
import { benefitExportGate } from "@/lib/benefitExport";
import { buildBenefitReportForRun } from "@/lib/benefitWithComparison";
import { resultsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const result = loadRunResult(resultsDir(), runId);
    if (!result) {
      return NextResponse.json({ error: "result not found" }, { status: 404 });
    }
    const report = buildBenefitReportForRun(result);
    const format = new URL(req.url).searchParams.get("format");
    if (format === "md" || format === "markdown" || format === "csv") {
      const gate = benefitExportGate(report);
      if (!gate.ok) {
        return NextResponse.json(
          {
            error: gate.error,
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
      return new NextResponse(benefitReportToCsv(report), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${runId}-benefit.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    return NextResponse.json({
      report,
      markdown: benefitReportToMarkdown(report),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
