import { NextResponse } from "next/server";
import {
  benefitReportToMarkdown,
  buildBenefitReport,
  loadRunResult,
} from "@skillevalator/core";
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
    const report = buildBenefitReport(result);
    const format = new URL(req.url).searchParams.get("format");
    if (format === "md" || format === "markdown") {
      return new NextResponse(benefitReportToMarkdown(report), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `inline; filename="${runId}-benefit.md"`,
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
