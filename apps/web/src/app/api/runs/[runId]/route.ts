import { NextResponse } from "next/server";
import {
  healRunOrphansFs,
  loadRunResult,
  syncStatusFromResult,
} from "@skillevalator/core";
import {
  loadEvaluationComparison,
  resolveTipCandidateRunId,
} from "@/lib/evaluations";
import { isPidAlive } from "@/lib/healOrphans";
import { jobsDir, resultsDir } from "@/lib/paths";
import { runCsvExportAllowed } from "@/lib/runCsvExportAllowed";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const root = resultsDir();
    healRunOrphansFs(jobsDir(), root, runId, isPidAlive);
    const result = loadRunResult(root, runId);
    const status = syncStatusFromResult(root, runId);
    if (!status && !result) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const tipCandidateRunId = result?.evaluationId
      ? resolveTipCandidateRunId(
          loadEvaluationComparison(result.evaluationId),
        )
      : null;
    return NextResponse.json({
      runId,
      status,
      result,
      csvExportAllowed: runCsvExportAllowed(result),
      tipCandidateRunId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
