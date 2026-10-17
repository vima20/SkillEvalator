import { NextResponse } from "next/server";
import { loadRunResult, syncStatusFromResult } from "@skillevalator/core";
import { healRunForFinalize, healRunForRead } from "@/lib/healOrphans";
import { resultsDir } from "@/lib/paths";
import {
  runCsvExportAllowed,
  runCsvExportBlockReason,
} from "@/lib/runCsvExportAllowed";
import { loadRunDetailEvaluationPack } from "@/lib/runDetailEvaluationPack";
import { runDetailRetryAdmissionForRun } from "@/lib/runDetailRetryAdmission";
import { runPreflight } from "@/lib/runPreflight";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await ctx.params;
    const root = resultsDir();
    const finalize =
      new URL(req.url).searchParams.get("finalizeOrphans") === "1";
    if (finalize) {
      healRunForFinalize(runId);
    } else {
      healRunForRead(runId);
    }
    const result = loadRunResult(root, runId);
    const status = syncStatusFromResult(root, runId);
    if (!status && !result) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { evaluationId, tipCandidateRunId, pairHarness } =
      loadRunDetailEvaluationPack({
        runId,
        result,
        status,
      });
    const preflight = runPreflight();
    // Heal already applied above; admission defaults to no full heal (wind-down).
    const retryAdmission = runDetailRetryAdmissionForRun({
      runId,
      result,
      status,
      preflight,
      healQueue: false,
    });
    return NextResponse.json({
      runId,
      status,
      result,
      csvExportAllowed: runCsvExportAllowed({ runId, result, status }),
      csvExportBlockReason: runCsvExportBlockReason({
        runId,
        result,
        status,
      }),
      tipCandidateRunId,
      pairHarness,
      resolvedEvaluationId: evaluationId,
      retryAdmission,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const code = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status: code });
  }
}
